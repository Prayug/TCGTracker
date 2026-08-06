import {
  cancelCaptureSession,
  completeCaptureSession,
  consumeCaptureSession,
  createCaptureSession,
  getCaptureSession,
  uploadCaptureImage,
} from '../captureSessionStore';

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('captureSessionStore', () => {
  it('creates a scan session that becomes ready after front upload', () => {
    const session = createCaptureSession('scan');
    expect(session.status).toBe('waiting');

    const uploaded = uploadCaptureImage(session.id, 'front', tinyPng);
    expect(uploaded.error).toBeUndefined();
    expect(uploaded.session?.status).toBe('ready');
    expect(uploaded.session?.frontImage).toBe(tinyPng);
  });

  it('supports grade front + back then consume', () => {
    const session = createCaptureSession('grade');
    uploadCaptureImage(session.id, 'front', tinyPng);
    expect(getCaptureSession(session.id)?.status).toBe('partial');

    uploadCaptureImage(session.id, 'back', tinyPng);
    const completed = completeCaptureSession(session.id);
    expect(completed.session?.status).toBe('ready');

    const consumed = consumeCaptureSession(session.id);
    expect(consumed.session?.frontImage).toBe(tinyPng);
    expect(consumed.session?.backImage).toBe(tinyPng);
    expect(getCaptureSession(session.id)?.status).toBe('consumed');
  });

  it('cancels sessions', () => {
    const session = createCaptureSession('scan');
    expect(cancelCaptureSession(session.id)).toBe(true);
    expect(getCaptureSession(session.id)).toBeNull();
  });
});
