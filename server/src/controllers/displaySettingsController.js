import * as displaySettingsService from "../services/displaySettingsService.js";

/** GET /api/gym-admin/competitions/:competitionId/display-settings. */
export async function getManagedDisplaySettings(req, res) {
  res.json(
    await displaySettingsService.getManagedDisplaySettings(
      res.locals.gyms,
      res.locals.params.competitionId,
    ),
  );
}

/** GET /api/competitions/:competitionId/display-settings for published competitions. */
export async function getPublicDisplaySettings(req, res) {
  res.json(
    await displaySettingsService.getPublicDisplaySettings(
      res.locals.params.competitionId,
    ),
  );
}

/** PUT /api/gym-admin/competitions/:competitionId/display-settings. */
export async function setDisplaySettings(req, res) {
  res.json(
    await displaySettingsService.setDisplaySettings(
      res.locals.gyms,
      res.locals.params.competitionId,
      req.auth.userId,
      req.body,
    ),
  );
}
