import mongoose, { Document, Schema } from 'mongoose';
import { UserSettings } from '@/types';

// Define the base interface without id to avoid conflicts
export interface UserData {
  githubId: number;
  githubUsername: string;
  email?: string;
  name?: string;
  avatarUrl: string;
  repositories: string[]; // repository full names
  settings: UserSettings;
  accessToken?: string; // GitHub access token
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocument extends UserData, Document {}

const UserSettingsSchema = new Schema<UserSettings>({
  autoReview: { type: Boolean, default: true },
  reviewLanguages: [{ type: String }],
  excludedPatterns: [{ type: String }],
  notificationPreferences: {
    email: { type: Boolean, default: true },
    slack: { type: String },
  },
});

const UserSchema = new Schema<UserDocument>({
  githubId: { type: Number, required: true, unique: true },
  githubUsername: { type: String, required: true },
  email: { type: String },
  name: { type: String },
  avatarUrl: { type: String, required: true },
  repositories: [{ type: String }],
  settings: { type: UserSettingsSchema, default: () => ({}) },
  accessToken: { type: String }, // GitHub access token
}, {
  timestamps: true,
});

// Indexes for better query performance
UserSchema.index({ githubUsername: 1 });
UserSchema.index({ repositories: 1 });

export const UserModel = mongoose.models.User || mongoose.model<UserDocument>('User', UserSchema); 