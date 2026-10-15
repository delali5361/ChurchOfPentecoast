import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { createPreviewId, readPreviewRows, writePreviewRows } from '../data/previewStore';
import type { PageId } from '../types';
import { supabase } from '../supabase';

type ServiceEvent = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  location: string | null;
  status: string;
};

type PreviewCheckin = { member_id: string; event_id: string; checked_in_at: string };
type Barcode = { rawValue: string };
type BarcodeScanner = { detect: (source: HTMLVideoElement) => Promise<Barcode[]> };
type BarcodeScannerConstructor = new (options: { formats: string[] }) => BarcodeScanner;

const QR_SCANNER = (window as Window & { BarcodeDetector?: BarcodeScannerConstructor }).BarcodeDetector;
const CHECKIN_WINDOW_MS = 4 * 60 * 60 * 1000;

function formatServiceDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MemberHomePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [memberName, setMemberName] = useState('Member');
  const [services, setServices] = useState<ServiceEvent[]>([]);
  const [checkins, setCheckins] = useState<PreviewCheckin[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [manualQr, setManualQr] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const loadMemberHome = async () => {
      try {
        if (!supabase) {
          const previewServices = readPreviewRows<ServiceEvent>('events')
            .filter((event) => event.status === 'scheduled'
              && new Date(event.starts_at).getTime() >= Date.now() - CHECKIN_WINDOW_MS)
            .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
          const savedCheckins = readPreviewRows<PreviewCheckin>('member_checkins');
          if (active) {
            setServices(previewServices);
            setCheckins(savedCheckins);
            setLoading(false);
          }
          return;
        }

        const { data: userResult, error: userError } = await supabase.auth.getUser();
        if (userError) throw new Error(`Could not identify your member account: ${userError.message}`);
        if (!userResult.user) throw new Error('Sign in to open your Member home.');
        const [profileResult, eventsResult] = await Promise.all([
          supabase.from('members').select('first_name').eq('user_id', userResult.user.id).maybeSingle(),
          supabase.from('events').select('id,title,event_type,starts_at,location,status')
            .eq('status', 'scheduled').gte('starts_at', new Date(Date.now() - CHECKIN_WINDOW_MS).toISOString()).order('starts_at'),
        ]);
        if (profileResult.error) throw new Error(`Could not load your membership profile: ${profileResult.error.message}`);
        if (eventsResult.error) throw new Error(`Could not load upcoming services and events: ${eventsResult.error.message}`);
        if (active) {
          setMemberName(profileResult.data?.first_name || 'Member');
          setServices((eventsResult.data ?? []) as ServiceEvent[]);
        }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load your Member home.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadMemberHome();
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (scanFrameRef.current !== null) window.cancelAnimationFrame(scanFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopCamera = () => {
    if (scanFrameRef.current !== null) window.cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraRunning(false);
  };

  const closeScanner = () => {
    stopCamera();
    setScanOpen(false);
    setCameraError('');
    setScanMessage('');
    setManualQr('');
  };

  const acceptQrValue = (value: string) => {
    setScanMessage('');
    let eventId = '';
    try {
      const parsed = new URL(value);
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (parsed.protocol === 'grace-assembly:' && parsed.hostname === 'service' && segments.length === 2 && segments[1] === 'checkin') {
        eventId = segments[0];
      } else {
        setScanMessage('This QR code is not a Grace Assembly service check-in code.');
        return;
      }
    } catch {
      setScanMessage('This QR code is not a Grace Assembly service check-in code.');
      return;
    }
    const service = services.find((event) => event.id === eventId && event.status === 'scheduled'
      && /service|worship/i.test(event.event_type));
    if (!service) {
      setScanMessage('This code does not match an upcoming service or event in your church workspace.');
      return;
    }
    if (supabase) {
      setScanMessage('QR recognized. Attendance will be recorded when the secure check-in service is connected.');
      stopCamera();
      return;
    }
    const memberId = window.localStorage.getItem('church-cms.preview.member-id') ?? createPreviewId();
    window.localStorage.setItem('church-cms.preview.member-id', memberId);
    if (checkins.some((checkin) => checkin.member_id === memberId && checkin.event_id === eventId)) {
      setScanMessage('You are already checked in for this service on this device.');
      stopCamera();
      return;
    }
    const nextCheckins = [...checkins, { member_id: memberId, event_id: eventId, checked_in_at: new Date().toISOString() }];
    writePreviewRows('member_checkins', nextCheckins);
    setCheckins(nextCheckins);
    setScanMessage(`Preview check-in recorded for ${service.title}.`);
    stopCamera();
  };

  const startCamera = async () => {
    setCameraError('');
    if (!QR_SCANNER) {
      setCameraError('QR scanning is not supported by this browser. Use a supported browser or connect the check-in scanner during backend setup.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      streamRef.current = stream;
      setCameraRunning(true);
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();
      const detector = new QR_SCANNER({ formats: ['qr_code'] });
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes[0]?.rawValue) {
            acceptQrValue(barcodes[0].rawValue);
            return;
          }
        } catch (error) {
          setCameraError(error instanceof Error ? `Could not read the QR code: ${error.message}` : 'Could not read the QR code.');
          stopCamera();
          return;
        }
        scanFrameRef.current = window.requestAnimationFrame(() => { void scan(); });
      };
      scanFrameRef.current = window.requestAnimationFrame(() => { void scan(); });
    } catch (error) {
      setCameraError(error instanceof Error ? `Could not start the camera: ${error.message}` : 'Could not start the camera.');
      stopCamera();
    }
  };

  const serviceEvents = services.filter((event) => /service|worship/i.test(event.event_type));
  const nextService = serviceEvents[0];

  return <div className="member-home">
    <section className="member-home-heading">
      <div><span className="eyebrow"><Icon name="sparkle" size={14} /> YOUR GRACE ASSEMBLY</span>
        <h1>Welcome home, {memberName}.</h1>
        <p>Your place to gather, stay connected, and take part in church life.</p>
      </div>
      <button className="button button-primary" onClick={() => onNavigate('events')}><Icon name="calendar" size={16} /> Explore events</button>
    </section>

    {loadError && <div className="workspace-alert" role="alert"><Icon name="shield" size={16} />{loadError}</div>}

    <section className="member-checkin-card glass-card">
      <div className="member-checkin-copy">
        <span className="eyebrow"><Icon name="clipboard" size={14} /> SERVICE CHECK-IN</span>
        <h2>{nextService ? nextService.title : 'Check in when you arrive'}</h2>
        <p>{nextService ? `${formatServiceDate(nextService.starts_at)}${nextService.location ? ` · ${nextService.location}` : ''}` : 'Scan the unique QR code displayed for your service. Each service has its own check-in.'}</p>
        {nextService && checkins.some((checkin) => checkin.event_id === nextService.id) && <span className="member-checkin-status"><Icon name="check" size={14} /> Checked in on this device</span>}
        <button className="button button-primary" onClick={() => { setScanOpen(true); setScanMessage(''); setCameraError(''); }}>
          <Icon name="clipboard" size={16} /> Scan service QR
        </button>
        {supabase && <small>Check-in will be securely recorded when the attendance service is connected.</small>}
      </div>
      <div className="member-checkin-art" aria-hidden="true"><div><Icon name="clipboard" size={44} /><span>QR</span></div><i /><i /></div>
    </section>

    <section className="member-feature-grid" aria-label="Member features">
      <button className="member-feature-card glass-card" onClick={() => onNavigate('events')}>
        <span className="member-feature-icon"><Icon name="calendar" size={19} /></span><strong>Events & gatherings</strong>
        <span>Browse upcoming services, register, and see what is happening.</span><small>{loading ? 'Loading events…' : `${services.length} upcoming ${services.length === 1 ? 'gathering' : 'gatherings'}`}</small>
      </button>
      <article className="member-feature-card glass-card">
        <span className="member-feature-icon"><Icon name="messages" size={19} /></span><strong>Church updates</strong>
        <span>Announcements and ministry messages for your church family.</span><small>Member announcements will appear here.</small>
      </article>
      <article className="member-feature-card glass-card">
        <span className="member-feature-icon"><Icon name="giving" size={19} /></span><strong>Giving & generosity</strong>
        <span>Offering, tithe, and giving records in one private place.</span><small>Online giving will be connected with a secure payment provider.</small>
      </article>
      <article className="member-feature-card glass-card">
        <span className="member-feature-icon"><Icon name="user" size={19} /></span><strong>My membership</strong>
        <span>Review your contact details and keep your profile up to date.</span><small>Profile editing will be available in the member portal.</small>
      </article>
    </section>

    {serviceEvents.length > 0 && <section className="member-upcoming glass-card">
      <div className="section-heading"><div><span className="eyebrow">MAKE TIME TO GATHER</span><h2>Upcoming services</h2></div>
        <button className="text-button" onClick={() => onNavigate('events')}>All events <Icon name="arrow-up" size={14} /></button>
      </div>
      {serviceEvents.slice(0, 3).map((service) => <div className="member-service-row" key={service.id}>
        <span className="member-service-date"><strong>{new Date(service.starts_at).toLocaleDateString(undefined, { day: '2-digit' })}</strong><small>{new Date(service.starts_at).toLocaleDateString(undefined, { month: 'short' })}</small></span>
        <span><strong>{service.title}</strong><small>{formatServiceDate(service.starts_at)}{service.location ? ` · ${service.location}` : ''}</small></span>
        <span className="member-service-check">{checkins.some((checkin) => checkin.event_id === service.id) ? 'Checked in' : 'Upcoming'}</span>
      </div>)}
    </section>}

    {scanOpen && <div className="search-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) closeScanner(); }}>
      <section className="member-scanner-dialog glass-card" role="dialog" aria-modal="true" aria-label="Scan service QR code">
        <div className="section-heading"><div><span className="eyebrow"><Icon name="clipboard" size={14} /> MEMBER CHECK-IN</span><h2>Scan this service’s QR code</h2></div>
          <button className="icon-button" aria-label="Close scanner" onClick={closeScanner}><Icon name="close" size={17} /></button></div>
        <p>Each service has a unique code. A member can check in only once per service.</p>
          <div className="member-camera-frame"><video ref={videoRef} playsInline muted aria-label="Camera QR scanner" /><span className="member-camera-reticle" />{!cameraRunning && <div className="member-camera-placeholder"><Icon name="clipboard" size={30} /><span>Camera preview appears here</span></div>}</div>
        {cameraError && <p className="workspace-alert" role="alert">{cameraError}</p>}
        {scanMessage && <p className="member-scan-message" role="status">{scanMessage}</p>}
        <form className="member-manual-checkin" onSubmit={(event) => { event.preventDefault(); acceptQrValue(manualQr.trim()); }}>
          <label htmlFor="member-service-code">Or enter a service QR link</label>
          <div><input id="member-service-code" type="text" value={manualQr} onChange={(event) => setManualQr(event.target.value)} placeholder="grace-assembly://service/{service-id}/checkin" />
            <button className="button button-ghost" type="submit" disabled={!manualQr.trim()}>Verify code</button></div>
        </form>
        <div className="member-scanner-actions">
          <button type="button" className="button button-primary" onClick={() => { void startCamera(); }}><Icon name="clipboard" size={16} /> Start camera</button>
          <button type="button" className="button button-ghost" onClick={() => { stopCamera(); closeScanner(); }}>Cancel</button>
        </div>
        {!supabase && <small>Preview check-ins are saved only in this browser. Secure service QR verification will be enforced by the backend.</small>}
      </section>
    </div>}
  </div>;
}
