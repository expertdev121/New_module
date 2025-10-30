/**
 * Utility functions for handling iframe navigation and communication
 */

export const isInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true; // If we can't access window.top, we're likely in an iframe
  }
};

export const getParentOrigin = (): string | null => {
  try {
    return window.parent.location.origin;
  } catch (e) {
    return null;
  }
};

export const navigateInParent = (url: string): void => {
  if (isInIframe()) {
    try {
      // Try to navigate the parent window
      window.parent.location.href = url;
    } catch (e) {
      // If direct navigation fails, try postMessage
      const parentOrigin = getParentOrigin();
      if (parentOrigin) {
        window.parent.postMessage({
          type: 'NAVIGATE',
          url: url
        }, parentOrigin);
      }
    }
  } else {
    // Not in iframe, use normal navigation
    window.location.href = url;
  }
};

export const signOutInIframe = async (): Promise<void> => {
  if (isInIframe()) {
    // For iframe, we want to stay within the iframe context
    // Don't navigate to login page, just sign out and let the iframe handle it
    const { signOut } = await import('next-auth/react');
    await signOut({ callbackUrl: window.location.origin });
  } else {
    // Normal sign out behavior
    const { signOut } = await import('next-auth/react');
    await signOut({ callbackUrl: '/' });
  }
};
