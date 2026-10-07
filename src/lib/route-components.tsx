import { lazyComponent } from '@/lib/lazy-component';

export const ManagerDashboard = lazyComponent(() => import('@/sections/ManagerDashboard').then((module) => ({ default: module.ManagerDashboard })));
export const GanttEditorPage = lazyComponent(() => import('@/sections/manager/GanttEditorPage').then((module) => ({ default: module.GanttEditorPage })));
export const NewsletterViewer = lazyComponent(() => import('@/sections/NewsletterViewer').then((module) => ({ default: module.NewsletterViewer })));
export const ProfilePage = lazyComponent(() => import('@/sections/ProfilePage').then((module) => ({ default: module.ProfilePage })));
export const UnsubscribePage = lazyComponent(() => import('@/sections/UnsubscribePage').then((module) => ({ default: module.UnsubscribePage })));
export const PasswordResetPage = lazyComponent(() => import('@/components/auth/PasswordResetPage').then((module) => ({ default: module.PasswordResetPage })));
export const VerifyEmailPage = lazyComponent(() => import('@/components/auth/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));
export const SignIn = lazyComponent(() => import('@/components/auth/SignIn').then((module) => ({ default: module.SignIn })));
export const SSOCallback = lazyComponent(() => import('@/components/auth/SSOCallback').then((module) => ({ default: module.SSOCallback })));
export const MigratePage = lazyComponent(() => import('@/sections/MigratePage').then((module) => ({ default: module.MigratePage })));
export const CommunityPage = lazyComponent(() => import('@/sections/community/CommunityPage').then((module) => ({ default: module.CommunityPage })));

