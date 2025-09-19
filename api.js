import fetch from 'node-fetch';

const SPTRANS_BASE_URL = 'http://api.olhovivo.sptrans.com.br/v2.1';
const API_KEY = process.env.SPTRANS_API_KEY;

let sessionCookie = null;

async function authenticate() {
  if (!API_KEY) {
    throw new Error('SPTRANS_API_KEY environment variable not set');
  }

  try {
    const response = await fetch(`${SPTRANS_BASE_URL}/Login/Autenticar?token=${API_KEY}`, {
      method: 'POST',
    });

    if (response.ok && response.headers.get('set-cookie')) {
      sessionCookie = response.headers.get('set-cookie');
      console.log('Successfully authenticated with SPTrans API');
      return true;
    } else {
      console.error('Failed to authenticate with SPTrans API');
      sessionCookie = null;
      return false;
    }
  } catch (error) {
    console.error('Error authenticating with SPTrans API:', error);
    sessionCookie = null;
    return false;
  }
}

async function ensureAuthenticated() {
  if (!sessionCookie) {
    await authenticate();
  }
}

// Authenticate immediately and then every 15 minutes
authenticate();
setInterval(authenticate, 15 * 60 * 1000);

export function getAuthStatus() {
  return { authenticated: !!sessionCookie };
}

export async function getBusPositions(lineCode) {
  await ensureAuthenticated();
  if (!sessionCookie) {
    throw new Error('Not authenticated');
  }

  try {
    const response = await fetch(`${SPTRANS_BASE_URL}/Posicao?codigoLinha=${lineCode}`, {
      headers: {
        Cookie: sessionCookie,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      throw new Error(`Failed to fetch bus positions: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error fetching bus positions for line ${lineCode}:`, error);
    throw error;
  }
}

export async function getBusRoute(lineCode) {
  await ensureAuthenticated();
  if (!sessionCookie) {
    throw new Error('Not authenticated');
  }

  try {
    const response = await fetch(`${SPTRANS_BASE_URL}/Trajeto?codigoLinha=${lineCode}`, {
      headers: {
        Cookie: sessionCookie,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      throw new Error(`Failed to fetch bus route: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error fetching bus route for line ${lineCode}:`, error);
    throw error;
  }
}
