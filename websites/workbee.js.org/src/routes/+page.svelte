<script>
import Card from "@design-system/components/Card.svelte";
import H1 from "@design-system/components/Heading1.svelte";
import H2 from "@design-system/components/Heading2.svelte";
import H3 from "@design-system/components/Heading3.svelte";
import Icon from "@design-system/components/Icon.svelte";
import Image from "@design-system/components/Image.svelte";
import LayoutSlices from "@design-system/components/LayoutSlices.svelte";
import A from "@design-system/elements/a.svelte";
import Div from "@design-system/elements/div.svelte";
import Li from "@design-system/elements/li.svelte";
import P from "@design-system/elements/p.svelte";
import Section from "@design-system/elements/section.svelte";
import Span from "@design-system/elements/span.svelte";
import Ul from "@design-system/elements/ul.svelte";
</script>

<svelte:head>
    <title>WorkBee - A tiny ServiceWorker for secure web applications</title>
    <meta
        name="description"
        content="WorkBee is a tiny, modular ServiceWorker library. Small, tree-shakeable, zero dependencies, GDPR compliant."
    />
</svelte:head>

<LayoutSlices>
    <Section class="slice hero vertical">
        <Div class="inline-center">
            <Image
                alt="workbee logo"
                src="/img/logo.svg"
                width="96"
                height="96"
                decoding="auto"
                fetchpriority="high"
                loading="eager"
            />
            <H1>The WorkBee ServiceWorker</H1>
            <P>A tiny ServiceWorker for secure web applications.</P>
            <Div role="group">
                <P>
                    <A href="/docs" class="button"
                        ><Span>Get Started</Span></A
                    >
                </P>
            </Div>
            <Ul class="grid">
                <Li class="stat">
                    <H3><Icon src="/img/icons.svg#feather" />
                        <Span>&lt;1KB</Span></H3>
                    <P>Minified + compressed</P>
                </Li>
                <Li class="stat">
                    <H3><Icon src="/img/icons.svg#list-check" />
                        <Span>100%</Span></H3>
                    <P>Test coverage</P>
                </Li>
                <Li class="stat">
                    <H3><Icon src="/img/icons.svg#shield" />
                        <Span>GDPR</Span></H3>
                    <P>Privacy first</P>
                </Li>
            </Ul>
        </Div>
    </Section>
    <Section class="slice vertical">
        <Div class="inline-center">
            <H2>Features</H2>
        </Div>
        <Ul class="grid">
            <Li class="card feature">
                <H3>Tree-Shakeable</H3>
                <P
                    >Import only what you use. Each strategy and middleware is a
                    separate export, keeping your ServiceWorker bundle tiny.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Middleware Architecture</H3>
                <P
                    >Compose caching strategies with pluggable middleware for
                    fallbacks, logging, offline support, and more.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Zero Dependencies</H3>
                <P
                    >No third-party code in your ServiceWorker. Fewer supply
                    chain risks, smaller install size, faster installs.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Privacy First</H3>
                <P
                    >GDPR compliant by design. No tracking, no analytics, no
                    third-party requests from your ServiceWorker.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Caching Strategies</H3>
                <P
                    >Cache-first, network-first, stale-while-revalidate, and
                    more. Pick the right strategy for each route.</P
                >
            </Li>
            <Li class="card feature">
                <H3>Offline Ready</H3>
                <P
                    >Queue failed requests, serve fallback pages, and detect
                    connectivity changes out of the box.</P
                >
            </Li>
        </Ul>
    </Section>
    <Section class="slice vertical">
        <Div class="inline-center">
            <H2>Getting Started</H2>
            <P>Install the core package and create your ServiceWorker in minutes.</P>
            <Ul class="steps">
                <Li>
                    <H3>1. Install</H3>
                    <pre><code>npm install @work-bee/core</code></pre>
                </Li>
                <Li>
                    <H3>2. Create <code>sw.js</code></H3>
                    <pre><code>{`import { compileConfig, eventInstall, eventActivate, eventFetch, strategyCacheFirst } from "@work-bee/core"

const config = compileConfig({
  cachePrefix: "sw-",
  routes: [{
    methods: ["GET"],
    pathPattern: new RegExp("/img/(.+)$"),
    cacheName: "img",
    strategy: strategyCacheFirst
  }]
})

addEventListener("install", (event) => eventInstall(event, config))
addEventListener("activate", (event) => eventActivate(event, config))
addEventListener("fetch", (event) => eventFetch(event, config))`}</code></pre>
                </Li>
                <Li>
                    <H3>3. Register</H3>
                    <pre><code>{`if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
}`}</code></pre>
                </Li>
            </Ul>
        </Div>
    </Section>
    <Section class="slice vertical">
        <Div class="inline-center">
            <H2>Packages</H2>
        </Div>
        <Ul class="grid">
            <Card class="package" id="core">
                <H3><A href="/docs/packages/core">@work-bee/core</A></H3>
                <P>Caching strategies and events</P>
            </Card>
            <Card class="package" id="cache-control">
                <H3><A href="/docs/packages/cache-control">@work-bee/cache-control</A></H3>
                <P>HTTP Cache-Control middleware</P>
            </Card>
            <Card class="package" id="fallback">
                <H3><A href="/docs/packages/fallback">@work-bee/fallback</A></H3>
                <P>Fallback response middleware</P>
            </Card>
            <Card class="package" id="inactivity">
                <H3><A href="/docs/packages/inactivity">@work-bee/inactivity</A></H3>
                <P>User inactivity detection</P>
            </Card>
            <Card class="package" id="logger">
                <H3><A href="/docs/packages/logger">@work-bee/logger</A></H3>
                <P>Logging middleware</P>
            </Card>
            <Card class="package" id="offline">
                <H3><A href="/docs/packages/offline">@work-bee/offline</A></H3>
                <P>Offline request queueing</P>
            </Card>
            <Card class="package" id="save-data">
                <H3><A href="/docs/packages/save-data">@work-bee/save-data</A></H3>
                <P>Save-Data header middleware</P>
            </Card>
            <Card class="package" id="session">
                <H3><A href="/docs/packages/session">@work-bee/session</A></H3>
                <P>Session management middleware</P>
            </Card>
        </Ul>
    </Section>
    <Section class="slice vertical">
        <Div class="inline-center">
            <H2>Read the Docs</H2>
            <P>Learn about caching strategies, middleware patterns, and configuration options.</P>
            <Div role="group">
                <P>
                    <A href="/docs" class="button"
                        ><Span>Documentation</Span></A
                    >
                </P>
            </Div>
        </Div>
    </Section>
</LayoutSlices>
