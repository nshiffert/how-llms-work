import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Topic page bodies live as MDX in src/content/topics/<slug>.mdx.
// Frontmatter carries the bits the template chrome needs; the body provides the
// five standard sections via the <Section> components.
const topics = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/topics' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['basics', 'finetune', 'generation', 'advanced', 'math']),
    hook: z.string(),
    // Slugs of related topics, rendered as cross-link callouts at the page foot.
    crossLinks: z.array(z.string()).default([]),
    // Lets us ship a page that isn't finished yet without listing it as ready.
    draft: z.boolean().default(false),
  }),
});

export const collections = { topics };
