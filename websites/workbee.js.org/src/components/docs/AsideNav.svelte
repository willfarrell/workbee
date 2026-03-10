<script>
import LayoutAsideNav from "@design-system/components/LayoutAsideNav.svelte";

const nav = {
	"Getting Started": {
		Introduction: "/docs",
		"Quick Start": "/docs/quick-start",
	},
	Packages: {
		core: "/docs/packages/core",
		"cache-control": "/docs/packages/cache-control",
		fallback: "/docs/packages/fallback",
		inactivity: "/docs/packages/inactivity",
		logger: "/docs/packages/logger",
		offline: "/docs/packages/offline",
		"save-data": "/docs/packages/save-data",
		session: "/docs/packages/session",
	},
};
</script>

<LayoutAsideNav {nav} />
