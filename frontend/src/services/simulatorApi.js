import { createHttpClient } from "./httpClient";
import { createSimulatorApi } from "./simulatorApiCore";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
const baseUrl = import.meta.env.DEV ? "/api" : configuredBaseUrl;
const requestTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 5000;
const api = createSimulatorApi(createHttpClient({ baseUrl, timeoutMs: requestTimeout }));

export const fetchWorldState = api.fetchWorldState;
export const fetchMapState = api.fetchMapState;
export const fetchSurvivorRoute = api.fetchSurvivorRoute;
export const requestNextStep = api.requestNextStep;
export const moveSurvivor = api.moveSurvivor;
export const selectScenario = api.selectScenario;
export const simulateTurn = api.simulateTurn;
export const dispatchRescue = api.dispatchRescue;
export const apiConfigured = Boolean(baseUrl);
