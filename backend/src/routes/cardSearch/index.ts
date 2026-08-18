import { Router } from 'express';
import imageRoutes from './imageRoutes';
import searchRoutes from './searchRoutes';
import catalogRoutes from './catalogRoutes';
import poolRoutes from './poolRoutes';
import populationRoutes from './populationRoutes';
import gradedRoutes from './gradedRoutes';

const router = Router();

router.use(imageRoutes);
router.use(searchRoutes);
router.use(catalogRoutes);
router.use(poolRoutes);
router.use(populationRoutes);
router.use(gradedRoutes);

export default router;
