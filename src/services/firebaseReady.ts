/**
 * Firebase Auth & Firestore Readiness Adapter
 * Reads public client config from VITE_FIREBASE_* environment variables when provisioned.
 * Never embeds hardcoded keys or simulates fake authentication.
 */

export interface FirebaseIntegrationState {
  configured: boolean;
  authMode: 'workspace-session' | 'firebase-auth';
  projectId: string | null;
}

export function getFirebaseIntegrationState(): FirebaseIntegrationState {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as
    | string
    | undefined;

  const configured = Boolean(apiKey && projectId);
  return {
    configured,
    authMode: configured ? 'firebase-auth' : 'workspace-session',
    projectId: projectId ?? null,
  };
}
