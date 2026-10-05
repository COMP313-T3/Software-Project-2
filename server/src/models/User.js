import mongoose from "mongoose";
import {
  ADDRESS_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  POSTAL_CODE_MAX_LENGTH,
} from "../constants/accountLimits.js";
import { COUNTRY_CODES } from "../constants/countries.js";
import { GENDER_VALUES } from "../constants/genders.js";
import { ACCOUNT_ROLES, ROLES } from "../constants/roles.js";

function isClimber() {
  return this.role === ROLES.CLIMBER;
}

function isLongitudeLatitude(coordinates) {
  const [longitude, latitude] = coordinates;
  return (
    coordinates.length === 2 &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
  );
}

const pointSchema = new mongoose.Schema(
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

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: NAME_MAX_LENGTH,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: NAME_MAX_LENGTH,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: EMAIL_MAX_LENGTH,
      unique: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ACCOUNT_ROLES },
    isActive: { type: Boolean, required: true, default: true },
    dateOfBirth: { type: Date, required: isClimber },
    gender: { type: String, enum: GENDER_VALUES, required: isClimber },
    phone: {
      type: String,
      trim: true,
      maxlength: PHONE_MAX_LENGTH,
      required: isClimber,
    },
    address: {
      type: String,
      trim: true,
      maxlength: ADDRESS_MAX_LENGTH,
      required: isClimber,
    },
    postalCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: POSTAL_CODE_MAX_LENGTH,
      required: isClimber,
    },
    country: { type: String, enum: COUNTRY_CODES, required: isClimber },
    location: { type: pointSchema },
    termsAcceptedAt: { type: Date, required: isClimber },
    termsVersion: { type: String, required: isClimber },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

userSchema.index({ location: "2dsphere" });

/**
 * A TopSend account. Emails are stored lowercase and must be unique. The password hash is
 * left out of query results unless a query asks for it with select("+passwordHash").
 * Climbers also have the profile they gave at sign-up; location is the optional map pin, as a
 * GeoJSON point ([longitude, latitude]) so nearby competitions can be found later.
 */
export const User = mongoose.model("User", userSchema);
