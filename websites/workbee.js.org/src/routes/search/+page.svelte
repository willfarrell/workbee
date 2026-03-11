<script>
let { data } = $props();
const _results = $derived(data.results);
</script>

<svelte:head>
    <title>Search | WorkBee</title>
    <meta name="description" content="Search the WorkBee documentation." />
</svelte:head>
<LayoutCenter>
    <Section>
        <H1>Search results</H1>
        {#if results.length}
            <Ul class="grid">
                {#each results as card}
                    <Card id={card.id}>
                        <H2
                            ><A href={card.href} aria-describedby={card.id}
                                >{card.title}</A
                            ></H2
                        >
                        {#if card.description}
                            <P>{@html card.description}</P>
                        {/if}
                        {#if card.button}
                            <Span aria-hidden="true" id={card.id}
                                >{card.button}</Span
                            >
                        {/if}
                    </Card>
                {/each}
            </Ul>
        {:else}
            <P>No pages found.</P>
        {/if}
    </Section>
</LayoutCenter>
