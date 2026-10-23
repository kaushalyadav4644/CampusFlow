
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2 },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }
}, { timestamps: true });

studentSchema.index({ email: 1 }, { unique: true });

const courseSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  instructor: { type: String, required: true },
  credits: { type: Number, required: true, min: 1 },
  capacity: { type: Number, required: true, min: 1 },
  description: { type: String, default: "" },
  color: { type: String, default: "indigo" }
}, { timestamps: true });

const enrollmentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true
  }
}, { timestamps: true });

enrollmentSchema.index(
  { student: 1, course: 1 },
  { unique: true }
);

const Student = mongoose.model("Student", studentSchema);
const Course = mongoose.model("Course", courseSchema);
const Enrollment = mongoose.model("Enrollment", enrollmentSchema);

const demoCourses = [
  {
    code: "CS401", title: "Full Stack Development",
    category: "Development", instructor: "Dr. Arjun Kumar",
    credits: 4, capacity: 40,
    description: "Build modern web applications using frontend and backend technologies.",
    color: "indigo"
  },
  {
    code: "CS402", title: "Artificial Intelligence",
    category: "AI & ML", instructor: "Dr. Priya Sharma",
    credits: 4, capacity: 35,
    description: "Explore intelligent systems, search algorithms and AI applications.",
    color: "purple"
  },
  {
    code: "CS403", title: "Database Management",
    category: "Data Science", instructor: "Prof. Rahul Verma",
    credits: 3, capacity: 45,
    description: "Learn database design, queries, data modeling and transactions.",
    color: "blue"
  },
  {
    code: "CS404", title: "Cloud Computing",
    category: "Cloud", instructor: "Dr. Neha Singh",
    credits: 3, capacity: 30,
    description: "Understand cloud architecture, deployment and scalable services.",
    color: "cyan"
  },
  {
    code: "CS405", title: "Cybersecurity",
    category: "Security", instructor: "Prof. Karan Mehta",
    credits: 3, capacity: 32,
    description: "Study network security, vulnerabilities and defensive techniques.",
    color: "rose"
  },
  {
    code: "CS406", title: "Data Structures & Algorithms",
    category: "Core CS", instructor: "Dr. Ananya Rao",
    credits: 4, capacity: 50,
    description: "Strengthen problem-solving skills with fundamental data structures.",
    color: "amber"
  }
];

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Course API is running" });
});

async function getCourseCatalog() {
  const courses = await Course.find().sort({ code: 1 }).lean();

  const counts = await Enrollment.aggregate([
    { $group: { _id: "$course", count: { $sum: 1 } } }
  ]);

  const countMap = new Map(
    counts.map(item => [String(item._id), item.count])
  );

  return courses.map(course => {
    const enrolled = countMap.get(String(course._id)) || 0;
    return {
      ...course,
      enrolled,
      availableSeats: Math.max(0, course.capacity - enrolled)
    };
  });
}

app.get("/api/courses", async (req, res) => {
  try {
    res.json(await getCourseCatalog());
  } catch (error) {
    res.status(500).json({ message: "Unable to load courses." });
  }
});

app.get("/api/registrations", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid student email." });
    }

    const student = await Student.findOne({ email });

    if (!student) return res.json([]);

    const registrations = await Enrollment.find({ student: student._id })
      .populate("course")
      .sort({ createdAt: -1 })
      .lean();

    res.json(registrations);
  } catch (error) {
    res.status(500).json({ message: "Unable to load registrations." });
  }
});

app.post("/api/registrations", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const courseId = String(req.body.courseId || "");

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        message: "Name must contain between 2 and 80 characters."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid course." });
    }

    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    let student = await Student.findOne({ email });

    if (student && student.name.toLowerCase() !== name.toLowerCase()) {
      return res.status(409).json({
        message: "This email is already associated with another student name."
      });
    }

    if (!student) {
      try {
        student = await Student.create({ name, email });
      } catch (error) {
        if (error.code !== 11000) throw error;
        student = await Student.findOne({ email });

        if (!student || student.name.toLowerCase() !== name.toLowerCase()) {
          return res.status(409).json({
            message: "Student details conflict with an existing record."
          });
        }
      }
    }

    const existing = await Enrollment.findOne({
      student: student._id,
      course: course._id
    });

    if (existing) {
      return res.status(409).json({
        message: "You are already registered for this course."
      });
    }

    const enrolled = await Enrollment.countDocuments({ course: course._id });

    if (enrolled >= course.capacity) {
      return res.status(409).json({
        message: "Sorry, this course is full."
      });
    }

    const registration = await Enrollment.create({
      student: student._id,
      course: course._id
    });

    res.status(201).json({
      message: "Course registered successfully!",
      registration
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "You are already registered for this course."
      });
    }

    console.error(error);
    res.status(500).json({ message: "Registration failed. Try again." });
  }
});

app.delete("/api/registrations/:id", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid registration." });
    }

    const student = await Student.findOne({ email });

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    const deleted = await Enrollment.findOneAndDelete({
      _id: req.params.id,
      student: student._id
    });

    if (!deleted) {
      return res.status(404).json({
        message: "Registration not found for this student."
      });
    }

    res.json({ message: "Registration cancelled successfully." });
  } catch (error) {
    res.status(500).json({ message: "Cancellation failed." });
  }
});

async function startServer() {
  await mongoose.connect(process.env.MONGO_URI);

  await Course.bulkWrite(
    demoCourses.map(course => ({
      updateOne: {
        filter: { code: course.code },
        update: { $setOnInsert: course },
        upsert: true
      }
    }))
  );

  const port = process.env.PORT || 5000;

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log("MongoDB connected and demo courses are ready.");
  });
}

startServer().catch(error => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
