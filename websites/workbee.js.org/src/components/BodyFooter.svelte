<script>
import BodyFooter from "@design-system/components/BodyFooter.svelte";
import Image from "@design-system/components/Image.svelte";
import A from "@design-system/elements/a.svelte";

const navLinks = {
	Docs: {
		Documentation: "/docs",
		Packages: "/docs/packages/core",
	},
	Community: {
		GitHub: "https://github.com/willfarrell/workbee",
		Sponsor: "https://github.com/sponsors/willfarrell",
	},
	More: {
		npm: "https://www.npmjs.com/package/@work-bee/core",
		"OpenSSF Scorecard":
			"https://scorecard.dev/viewer/?uri=github.com/willfarrell/workbee",
	},
};
</script>

<BodyFooter {navLinks}>
    {#snippet logo()}
        <A href="/">
          <Image
            src="/img/logo.svg"
            alt="workbee logo, to the homepage"
            width="48"
            height="48"
          />
        </A>
    {/snippet}
</BodyFooter>
