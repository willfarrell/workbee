<script>
const {
	title = "Documentation",
	description,
	headings = [],
	children,
} = $props();
</script>

<svelte:head>
	{#if title}
		<title>{title} | WorkBee</title>
	{/if}
	{#if description}
		<meta name="description" content={description} />
	{/if}
</svelte:head>

<LayoutAside>
    {#snippet aside()}
      <AsideNav />
    {/snippet}
<LayoutTableOfContents>
    {#snippet header()}
		<Hgroup>
			<H1>{title}</H1>
		</Hgroup>
    {/snippet}
    {#snippet aside()}
		<NavScrollspy>
			<Ol>
				{#if headings.length > 0}
					{#each headings as heading}
						<Li><A href="#{heading.id}">{heading.text}</A></Li>
					{/each}
				{/if}
			</Ol>
		</NavScrollspy>
    {/snippet}
	{@render children?.()}
</LayoutTableOfContents>
</LayoutAside>
