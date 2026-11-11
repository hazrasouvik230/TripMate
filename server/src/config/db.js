import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    console.error(`   The server will start, but database operations will fail.`);
    console.error(`   Fix your MONGODB_URI or whitelist your IP in Atlas.`);
  }
};

export default connectDB;
