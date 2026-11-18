import manualMarkdown from '../../../../../../docs/user-manual/README.md?raw';
import knownIssuesMarkdown from '../../../../../../docs/user-manual/known-issues.md?raw';

export interface ManualSection {
  id: string;
  title: string;
  content: string;
}

// Vite embeds both source documents in the UI bundle. There is no network or filesystem lookup
// when an installed copy of Scribe opens Help.
const [intro = '', ...chapters] = manualMarkdown.trim().split(/\n(?=## )/);

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    content: intro.replace(/^# [^\n]+\n/, '').trim(),
  },
  ...chapters.map((chapter) => {
    const heading = /^## ([^\n]+)\n?/.exec(chapter);
    if (!heading) throw new Error('Unexpected User Manual heading');
    const number = /^(\d+)\. /.exec(heading[1]);
    const title = heading[1];
    return {
      id: number ? 'section-' + number[1] : title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title,
      content: chapter.slice(heading[0].length).trim(),
    };
  }),
  {
    id: 'known-issues',
    title: 'Known issues',
    content: knownIssuesMarkdown.replace(/^# [^\n]+\n/, '').trim(),
  },
];

export const numberedManualSections = MANUAL_SECTIONS.filter((section) =>
  /^section-\d+$/.test(section.id),
);
