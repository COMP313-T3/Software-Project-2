import {
  getSystemSettings,
  updateSystemSettings,
} from "../services/systemSettingsService.js";

export async function getSettings(req, res) {
  res.json(await getSystemSettings());
}

export async function updateSettings(req, res) {
  res.json(await updateSystemSettings(req.body));
}
