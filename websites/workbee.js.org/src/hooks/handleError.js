export async function handleError({ kind, error, event }) {
	// Kit 3 also passes expected `error()` throws ("app"), its own 404s/405s
	// ("framework") and bad remote-function input ("validation"); only
	// "unknown" errors are server bugs worth a log line.
	if (kind !== "unknown") return;
	// Never log `event` itself: it carries platform.cf (geo/TLS), env bindings
	// and query strings.
	console.error(
		JSON.stringify({
			log_level: "ERROR",
			message: error?.message ?? "Internal Error",
			stack: error?.stack,
			status_code: 500,
			method: event.request.method,
			path: event.url.pathname,
			route: event.route?.id,
		}),
	);
}
