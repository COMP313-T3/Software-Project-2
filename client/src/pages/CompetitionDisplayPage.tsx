import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import BackgroundPicker from "../components/leaderboard/BackgroundPicker.tsx";
import CompetitionDisplay from "../components/leaderboard/CompetitionDisplay.tsx";
import { backgroundImage } from "../lib/displayBackgrounds.ts";
import { displayGateway, referenceImage } from "../lib/displaySettingsApi.ts";
import { DivisionStandings } from "./LeaderboardPage.tsx";
import { getManagedCompetition } from "../lib/gymAdminApi.ts";
import { ApiError } from "../lib/apiClient.ts";
import { emptyDisplay, sameDisplay, PREVIEW_IMAGE_TYPES, type DisplayGateway, type DisplayImage, type DisplaySettings } from "../lib/displayCustomization.ts";
import common from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./CompetitionDisplayPage.module.css";

/** #178/#179: UI and preview; attach an adapter when Richard's upload contract is available. */
type CompetitionLoader = (id: string, signal: AbortSignal) => Promise<{ _id: string; name: string }>;
export default function CompetitionDisplayPage({ gateway = displayGateway, loadCompetition = getManagedCompetition }: { gateway?: DisplayGateway; loadCompetition?: CompetitionLoader }) {
  const { user } = useSession(), { competitionId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  return <DisplayWorkspace key={user.userId + competitionId} competitionId={competitionId} gateway={gateway} loadCompetition={loadCompetition} />;
}
function DisplayWorkspace({ competitionId, gateway, loadCompetition }: { competitionId: string; gateway?: DisplayGateway; loadCompetition: CompetitionLoader }) {
  const { search } = useLocation();
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState<DisplaySettings>(emptyDisplay), [draft, setDraft] = useState<DisplaySettings>(emptyDisplay);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(""), [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0), [unavailable, setUnavailable] = useState(false);
  const [references, setReferences] = useState({ logo: "", sponsors: "" });
  const owned = useRef(new Set<string>()), write = useRef<AbortController | null>(null);
  const objectIdValid = /^[a-f\d]{24}$/i.test(competitionId);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (!objectIdValid) throw new Error("Invalid competition link. Open a competition from your dashboard.");
        const competition = await loadCompetition(competitionId, controller.signal);
        if (controller.signal.aborted) return;
        if (competition._id !== competitionId) throw new Error("Competition mismatch");
        const snapshot = gateway ? await gateway.load(competitionId, controller.signal) : null;
        if (controller.signal.aborted) return;
        if (snapshot && snapshot.competitionId !== competitionId) throw new Error("Competition mismatch");
        setTitle(competition.name); setSaved(snapshot?.settings ?? emptyDisplay()); setDraft(snapshot?.settings ?? emptyDisplay());
      } catch (error) {
        if (!controller.signal.aborted) {
          setProblem(!objectIdValid ? "Invalid competition link. Open a competition from your dashboard." : "Couldn't load display settings for this competition. Please try again.");
          setUnavailable(true);
          if (error instanceof ApiError && error.status === 403) setProblem("You don't have access to this competition.");
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [competitionId, gateway, revision, objectIdValid, loadCompetition]);
  useEffect(() => { const urls = owned.current; return () => { write.current?.abort(); for (const url of urls) URL.revokeObjectURL(url); }; }, []);
  function pick(field: "logo" | "sponsors", files: FileList | null) {
    if (!files?.length || saving) return;
    const images: DisplayImage[] = [];
    for (const file of Array.from(files)) {
      if (!PREVIEW_IMAGE_TYPES.includes(file.type)) { setProblem("Choose PNG, JPEG or WebP images for the preview."); return; }
    }
    for (const file of Array.from(files)) { const src = URL.createObjectURL(file); owned.current.add(src); images.push({ src, name: file.name, file }); }
    setDraft(previous => ({ ...previous, [field]: field === "sponsors" ? [...previous.sponsors, ...images] : images[0] })); setProblem(""); setNotice("");
  }
  function applyReference(field: "logo" | "sponsors") {
    try {
      const image = referenceImage(references[field], field === "sponsors" ? `Sponsor ${draft.sponsors.length + 1}` : "Event logo");
      setDraft(previous => ({ ...previous, [field]: field === "sponsors" ? [...previous.sponsors, image] : image }));
      setReferences(previous => ({ ...previous, [field]: "" })); setProblem(""); setNotice("");
    } catch { setProblem("Enter a valid HTTP(S) image URL or existing asset reference, up to 2048 characters."); }
  }
  async function save() {
    if (!gateway || write.current || sameDisplay(saved, draft)) return;
    const controller = new AbortController(); write.current = controller; setSaving(true); setProblem(""); setNotice("");
    try {
      const result = await gateway.save(competitionId, draft, controller.signal);
      if (controller.signal.aborted) return;
      if (result.competitionId !== competitionId) throw new Error("Competition mismatch");
      setSaved(result.settings); setDraft(result.settings); setNotice("Display settings saved.");
    } catch (error) {
      if (!controller.signal.aborted) {
        setProblem("Couldn't confirm the save. Your preview is unchanged. Reload saved settings before trying again.");
        if (error instanceof ApiError && [401,403,404].includes(error.status)) { setUnavailable(true); setDraft(emptyDisplay()); setSaved(emptyDisplay()); setProblem("This competition is no longer available to this account."); }
      }
    } finally { write.current = null; if (!controller.signal.aborted) setSaving(false); }
  }
  const changed = !sameDisplay(saved, draft);
  const imageField = (field: "logo" | "sponsors") => <section key={field} className={styles.field}><label htmlFor={`reference-${field}`}>{field === "logo" ? "Gym or event logo" : "Sponsor images"}</label>
    <div className={styles.reference}><input id={`reference-${field}`} type="text" maxLength={2048} placeholder="Image URL or asset reference" value={references[field]} onChange={event => setReferences(previous => ({ ...previous, [field]: event.target.value }))} /><button type="button" disabled={!references[field].trim()} onClick={() => applyReference(field)}>{field === "sponsors" ? "Add sponsor" : "Preview image"}</button></div>
    {gateway?.localPreviewFiles && <><label htmlFor={`display-${field}`}>Local {field} preview</label><input id={`display-${field}`} type="file" accept={PREVIEW_IMAGE_TYPES.join(",")} multiple={field === "sponsors"} onChange={event => { pick(field, event.target.files); event.target.value = ""; }} /></>}
    {field === "sponsors" ? <ul className={styles.images}>{draft.sponsors.map((image,index) => <li key={image.src+index}><SelectedImage image={image} /><button className={styles.remove} type="button" aria-label={`Remove sponsor ${index+1}: ${image.name}`} onClick={() => { setDraft(previous => ({ ...previous, sponsors: previous.sponsors.filter((_, i) => i !== index) })); setNotice(""); }}>Remove</button></li>)}</ul>
      : draft.logo ? <div className={styles.imageRow}><SelectedImage key={draft.logo.src} image={draft.logo} /><button className={styles.remove} type="button" aria-label="Remove logo" onClick={() => { setDraft(previous => ({ ...previous, logo: null })); setNotice(""); }}>Remove</button></div> : <p className={styles.help}>No logo selected</p>}
  </section>;
  return <AppLayout title="Display customization"><title>Display customization | TopSend</title><div className={common.page}>
    <div className={common.intro}><div><Link className={common.back} to={`/gym-admin/competitions/${encodeURIComponent(competitionId)}${search}`}>Back to competition</Link><p>Customize the competition logo, background and sponsor images.</p></div><Link className={styles.viewLink} to={`/gym-admin/competitions/${encodeURIComponent(competitionId)}/leaderboard${search}`}>View leaderboard</Link></div>
    {loading ? <p role="status">Loading display settings…</p> : <>
      {problem && <div role="alert" className={styles.error}><p>{problem}</p>{!saving && objectIdValid && <button onClick={() => { setLoading(true); setUnavailable(false); setProblem(""); setRevision(v => v + 1); }}>Reload saved settings</button>}</div>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      {!unavailable && <><h2 className={styles.title}>{title}</h2>{!gateway && <p className={styles.pending}>Preview only: saving is currently unavailable. Selected images stay in this page and are not uploaded.</p>}
      <div className={styles.grid}><form className={styles.editor} onSubmit={event => { event.preventDefault(); void save(); }} aria-label="Display settings" aria-busy={saving}>
        <fieldset disabled={saving}><legend>Display images</legend><p className={styles.help}>Paste an image address for the logo or a sponsor, preview it, then save your changes. File uploads are not available.</p>
          {imageField("logo")}
          <section className={styles.field}><BackgroundPicker value={draft.background?.reference ?? null} onChange={key => { setDraft(previous => ({ ...previous, background: backgroundImage(key) })); setProblem(""); setNotice(""); }} /></section>
          {imageField("sponsors")}
        </fieldset><div className={styles.actions}><button type="submit" disabled={!gateway || !changed || saving}>{saving ? "Saving…" : "Save changes"}</button><button type="button" disabled={!changed || saving} onClick={() => { setDraft(saved); setProblem(""); setNotice(""); }}>Discard changes</button></div>{changed && <p className={styles.help}>Unsaved changes</p>}
      </form><section className={styles.preview} aria-labelledby="display-preview-heading"><div className={styles.previewHeading}><h2 id="display-preview-heading">Live preview</h2><span className={styles.previewBadge}>{changed ? "Unsaved preview" : "Saved appearance"}</span></div><p className={styles.help}>Sample rankings for layout only. Logos and sponsors fit their frames; backgrounds fill the display.</p>
        <CompetitionDisplay settings={draft} title={title}><DivisionStandings division={sampleDivision} /></CompetitionDisplay>
      </section></div></>}
    </>}
  </div></AppLayout>;
}
const sampleDivision = { _id: "preview", name: "Sample division", climberCount: 2, standings: [
  { entryId: "sample-1", rank: 1, tied: false, climber: { firstName: "Sample", lastName: "Climber A" }, totalScore: 280, sends: 3, flashes: 2, attemptsToTops: 4, problemsRecorded: 3 },
  { entryId: "sample-2", rank: 2, tied: false, climber: { firstName: "Sample", lastName: "Climber B" }, totalScore: 240, sends: 3, flashes: 1, attemptsToTops: 6, problemsRecorded: 3 },
] };

function SelectedImage({ image }: { image: DisplayImage }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.selectedImage}><div className={styles.thumbnail}>{!failed && <img key={image.src} src={image.src} alt="" onError={() => setFailed(true)} />}</div><div className={styles.imageDetails}><span>{image.name}</span>{image.reference && <details><summary>Image address</summary><p>{image.reference}</p></details>}</div></div>;
}
