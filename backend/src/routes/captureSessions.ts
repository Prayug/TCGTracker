import { Router, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { ok, fail } from '../utils/apiResponse';
import {
  cancelCaptureSession,
  completeCaptureSession,
  consumeCaptureSession,
  createCaptureSession,
  getCaptureSession,
  toPublicSession,
  uploadCaptureImage,
} from '../services/captureSessionStore';
import { getLanIpv4Addresses } from '../utils/lanAddresses';

const createSchema = z.object({
  body: z.object({
    mode: z.enum(['scan', 'grade']),
  }),
});

const uploadSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    side: z.enum(['front', 'back']).default('front'),
    image: z.string().min(1),
  }),
});

const idParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

const router = Router();

router.get('/network', (_req, res: Response) => {
  const lanHosts = getLanIpv4Addresses();
  return ok(res, {
    lanHosts,
    primaryHost: lanHosts[0] ?? null,
  });
});

router.post('/', validate(createSchema), (req, res: Response) => {
  const session = createCaptureSession(req.body.mode);
  const lanHosts = getLanIpv4Addresses();
  return ok(
    res,
    {
      ...toPublicSession(session),
      capturePath: `/capture/${session.id}`,
      lanHosts,
      primaryLanHost: lanHosts[0] ?? null,
    },
    201
  );
});

router.get('/:id', validate(idParamsSchema), (req, res: Response) => {
  const session = getCaptureSession(req.params.id);
  if (!session) return fail(res, 'Capture session not found or expired', 404);
  const includeImages = req.query.includeImages === '1' || req.query.includeImages === 'true';
  // Only return bulky images once the session is ready (or partial for preview).
  const allowImages =
    includeImages && (session.status === 'ready' || session.status === 'partial');
  return ok(res, toPublicSession(session, allowImages));
});

router.post('/:id/image', validate(uploadSchema), (req, res: Response) => {
  const result = uploadCaptureImage(req.params.id, req.body.side, req.body.image);
  if (result.error) return fail(res, result.error, result.status || 400);
  return ok(res, toPublicSession(result.session!));
});

router.post('/:id/complete', validate(idParamsSchema), (req, res: Response) => {
  const result = completeCaptureSession(req.params.id);
  if (result.error) return fail(res, result.error, result.status || 400);
  return ok(res, toPublicSession(result.session!));
});

router.post('/:id/consume', validate(idParamsSchema), (req, res: Response) => {
  const result = consumeCaptureSession(req.params.id);
  if (result.error) return fail(res, result.error, result.status || 400);
  return ok(res, toPublicSession(result.session!, true));
});

router.delete('/:id', validate(idParamsSchema), (req, res: Response) => {
  cancelCaptureSession(req.params.id);
  return ok(res, { cancelled: true });
});

export default router;
