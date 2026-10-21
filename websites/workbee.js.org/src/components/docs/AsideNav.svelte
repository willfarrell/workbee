<script>
import LayoutAsideNav from "@willfarrell-ds/svelte/components/LayoutAsideNav.svelte";

const nav = {
	"Getting Started": {
		Introduction: "/docs",
		"Quick Start": "/docs/quick-start",
		Concepts: "/docs/concepts",
	},
	Packages: {
		core: "/docs/packages/core",
		"cache-control": "/docs/packages/cache-control",
		fallback: "/docs/packages/fallback",
		inactivity: "/docs/packages/inactivity",
		logger: "/docs/packages/logger",
		offline: "/docs/packages/offline",
		"precache-json": "/docs/packages/precache-json",
		"save-data": "/docs/packages/save-data",
		session: "/docs/packages/session",
	},
};
</script>

<LayoutAsideNav {nav} />
