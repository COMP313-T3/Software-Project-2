import mongoose from "mongoose";

function isLongitudeLatitude(coordinates) {
  const [longitude, latitude] = coordinates;
  return (
    coordinates.length === 2 &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
  );
}

/**
 * A GeoJSON point, [longitude, latitude], as MongoDB's 2dsphere indexes and geo queries expect.
 * Shared by models that store a map pin, such as Competition.mapPoint. (User.js has the same
 * definition inline and can import this one instead.)
 */
export const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: isLongitudeLatitude,
    },
  },
  { _id: false },
);
