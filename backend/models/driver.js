const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$.{53}$/;

const driverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true, // Remove extra spaces
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/.+\@.+\..+/, "Please fill a valid email address"], // Basic email regex
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["driver", "admin"],
      default: "driver", // Default to 'driver' role
    },
    phone: {
      type: String,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      required: true,
    },
    recordStatus: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },
    hourlyRate: {
      type: Number,
      min: 0,
    },
    kmRate: {
      type: Number,
      min: 0,
    },
    // Password reset — only ever a SHA-256 hash of the emailed token, never
    // the raw token itself, so a database read (or leak) can't be used to
    // reset the account. select: false keeps it out of default query
    // results (e.g. getProfile's Driver.findById) without needing every
    // caller to remember to .select("-resetPasswordTokenHash").
    resetPasswordTokenHash: {
      type: String,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

// Pre-save hook to normalize email and protect password hashing centrally.
driverSchema.pre("save", async function (next) {
  if (this.isModified("email")) {
    this.email = this.email.toLowerCase();
  }

  if (this.isModified("password") && !BCRYPT_HASH_REGEX.test(this.password)) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  next();
});

module.exports = mongoose.model("Driver", driverSchema);
