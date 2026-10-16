import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { readPreviewRows, writePreviewRows, createPreviewId } from '../data/previewStore';
import type { PageId } from '../types';
import { supabase } from '../supabase';

type MediaAsset = { id: string; name: string; event: string; category: string; status: string };
type MediaAssignment = { id: string; person: string; responsibility: string; event: string; status: string };
type EquipmentItem = { id: string; name: string; quantity: string; condition: string };
type RunCue = { id: string; time: string; cue: string; owner: string; complete: boolean };

function usePreviewRows<T>(collection: string): [T[], (rows: T[]) => void] {
  const [rows, setRows] = useState<T[]>(() => readPreviewRows<T>(collection));
  const save = (nextRows: T[]) => {
    writePreviewRows(collection, nextRows);
    setRows(nextRows);
  };
  return [rows, save];
}

const content: Partial<Record<PageId, { eyebrow: string; title: string; description: string }>> = {
  'media-library': { eyebrow: 'ASSET ORGANIZATION', title: 'Media library', description: 'Keep track of photos, video, graphics, and the service or campaign they belong to.' },
  'media-team': { eyebrow: 'TEAM COORDINATION', title: 'Team assignments', description: 'Coordinate camera, sound, projection, photography, and livestream coverage.' },
  'media-equipment': { eyebrow: 'PRODUCTION READINESS', title: 'Equipment', description: 'Track equipment quantities and readiness before services and events.' },
  'media-run-sheet': { eyebrow: 'SERVICE PRODUCTION', title: 'Service run sheet', description: 'Organize production cues, owners, and timing for a service.' },
};

export function MediaWorkspacePage({ page, onAction }: { page: PageId; onAction: (message: string) => void }) {
  const [assets, saveAssets] = usePreviewRows<MediaAsset>('media_assets');
  const [assignments, saveAssignments] = usePreviewRows<MediaAssignment>('media_assignments');
  const [equipment, saveEquipment] = usePreviewRows<EquipmentItem>('media_equipment');
  const [cues, saveCues] = usePreviewRows<RunCue>('media_run_cues');
  const section = content[page] ?? content['media-library']!;
  const previewOnly = (callback: () => void) => {
    if (supabase) {
      onAction('Media workspace changes are not connected to the church backend yet. No changes were saved.');
      return;
    }
    try {
      callback();
      onAction('Saved to this browser’s media preview only.');
    } catch (error) {
      onAction(`Could not save media preview data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>, callback: (form: FormData) => void) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    previewOnly(() => callback(form));
    if (!supabase) event.currentTarget.reset();
  };

  return <>
    <PageHeading page={page} />
    <section className="media-workspace">
      <div className="media-workspace-intro glass-card">
        <div><span className="eyebrow"><Icon name="sparkle" size={14} /> {section.eyebrow}</span><h2>{section.title}</h2><p>{section.description}</p></div>
        <span className="media-preview-badge">{supabase ? 'Backend connection required' : 'Local preview'}</span>
      </div>
      {page === 'media-library' && <>
        <form className="media-entry-form glass-card" onSubmit={(event) => submit(event, (form) => saveAssets([...assets, {
          id: createPreviewId(), name: String(form.get('name') ?? '').trim(), event: String(form.get('event') ?? '').trim(),
          category: String(form.get('category') ?? 'Photo'), status: 'Catalogued',
        }]))}>
          <label>Asset name<input name="name" required maxLength={100} placeholder="Sunday service highlights" /></label>
          <label>Service or event<input name="event" required maxLength={100} placeholder="Sunday worship" /></label>
          <label>Type<select name="category"><option>Photo</option><option>Video</option><option>Graphic</option><option>Audio</option><option>Livestream</option></select></label>
          <button className="button button-primary" type="submit"><Icon name="plus" size={15} /> Add asset record</button>
        </form>
        <div className="media-card-list">{assets.map((asset) => <article className="media-record glass-card" key={asset.id}><span className="media-record-icon"><Icon name="file" size={18} /></span><div><strong>{asset.name}</strong><small>{asset.category} · {asset.event}</small></div><span className="media-state">{asset.status}</span></article>)}{!assets.length && <MediaEmpty text="No media assets have been catalogued yet." />}</div>
        <p className="media-footnote">This preview catalogs asset details only; it does not upload or store media files.</p>
      </>}
      {page === 'media-team' && <>
        <form className="media-entry-form glass-card" onSubmit={(event) => submit(event, (form) => saveAssignments([...assignments, {
          id: createPreviewId(), person: String(form.get('person') ?? '').trim(), responsibility: String(form.get('responsibility') ?? ''),
          event: String(form.get('event') ?? '').trim(), status: 'Assigned',
        }]))}>
          <label>Team member<input name="person" required maxLength={80} placeholder="Name" /></label>
          <label>Responsibility<select name="responsibility"><option>Camera</option><option>Sound</option><option>Projection</option><option>Photography</option><option>Livestream</option><option>Producer</option></select></label>
          <label>Service or event<input name="event" required maxLength={100} placeholder="Sunday worship" /></label>
          <button className="button button-primary" type="submit"><Icon name="plus" size={15} /> Assign coverage</button>
        </form>
        <div className="media-card-list">{assignments.map((assignment) => <article className="media-record glass-card" key={assignment.id}><span className="media-record-icon"><Icon name="users" size={18} /></span><div><strong>{assignment.person} · {assignment.responsibility}</strong><small>{assignment.event}</small></div><span className="media-state">{assignment.status}</span></article>)}{!assignments.length && <MediaEmpty text="No media coverage assignments yet." />}</div>
      </>}
      {page === 'media-equipment' && <>
        <form className="media-entry-form glass-card" onSubmit={(event) => submit(event, (form) => saveEquipment([...equipment, {
          id: createPreviewId(), name: String(form.get('name') ?? '').trim(), quantity: String(form.get('quantity') ?? '1'),
          condition: String(form.get('condition') ?? 'Ready'),
        }]))}>
          <label>Equipment<input name="name" required maxLength={80} placeholder="Wireless microphone" /></label>
          <label>Quantity<input name="quantity" type="number" required min="1" max="999" defaultValue="1" /></label>
          <label>Readiness<select name="condition"><option>Ready</option><option>Needs check</option><option>Needs repair</option></select></label>
          <button className="button button-primary" type="submit"><Icon name="plus" size={15} /> Add equipment</button>
        </form>
        <div className="media-card-list">{equipment.map((item) => <article className="media-record glass-card" key={item.id}><span className="media-record-icon"><Icon name="settings" size={18} /></span><div><strong>{item.name}</strong><small>Quantity: {item.quantity}</small></div><span className={`media-state ${item.condition === 'Ready' ? '' : 'media-state-attention'}`}>{item.condition}</span></article>)}{!equipment.length && <MediaEmpty text="No equipment has been added to the preview inventory." />}</div>
      </>}
      {page === 'media-run-sheet' && <>
        <form className="media-entry-form glass-card" onSubmit={(event) => submit(event, (form) => saveCues([...cues, {
          id: createPreviewId(), time: String(form.get('time') ?? ''), cue: String(form.get('cue') ?? '').trim(),
          owner: String(form.get('owner') ?? '').trim(), complete: false,
        }]))}>
          <label>Time<input name="time" type="time" required /></label>
          <label>Production cue<input name="cue" required maxLength={120} placeholder="Bring up welcome slide" /></label>
          <label>Owner<input name="owner" required maxLength={80} placeholder="Team member" /></label>
          <button className="button button-primary" type="submit"><Icon name="plus" size={15} /> Add cue</button>
        </form>
        <div className="media-card-list">{cues.map((cue) => <article className={`media-record glass-card ${cue.complete ? 'media-record-complete' : ''}`} key={cue.id}><button type="button" className="media-cue-check" aria-label={cue.complete ? 'Mark cue incomplete' : 'Mark cue complete'} onClick={() => previewOnly(() => saveCues(cues.map((item) => item.id === cue.id ? { ...item, complete: !item.complete } : item)))}><Icon name={cue.complete ? 'check' : 'clock'} size={16} /></button><div><strong>{cue.time} · {cue.cue}</strong><small>Owner: {cue.owner}</small></div><span className="media-state">{cue.complete ? 'Done' : 'Upcoming'}</span></article>)}{!cues.length && <MediaEmpty text="Add production cues to build a service run sheet." />}</div>
      </>}
    </section>
  </>;
}

function MediaEmpty({ text }: { text: string }) {
  return <div className="media-empty glass-card"><Icon name="file" size={22} /><span>{text}</span></div>;
}
