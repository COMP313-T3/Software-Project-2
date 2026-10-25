import mongoose from "mongoose";

mongoose.set("strictQuery", true);
mongoose.set("sanitizeFilter", true);

/**
 * Connects Mongoose to MongoDB.
 *
 * sanitizeFilter makes Mongoose treat query operators such as $ne or $gt that
 * arrive inside filter values as plain values, which blocks NoSQL injection
 * through user input.
 *
 * @param {string} uri MongoDB connection string, including the database name.
 * @returns {Promise<string>} Name of the database the connection uses.
 */
export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  return mongoose.connection.name;
}

/**
 * Closes the Mongoose connection.
 *
 * @returns {Promise<void>}
 */
export async function disconnectDatabase() {
  await mongoose.connection.close();
}

/**
 * Reports whether Mongoose has an open connection.
 *
 * @returns {boolean} True when connected.
 */
export function isDatabaseConnected() {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
