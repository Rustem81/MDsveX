import MarkdownIt from 'markdown-it';
import { svelte } from './md/svelteParse';
import { codeExec } from './md/codeParse';
import * as p from 'path-browserify';
import { escapeCurly } from './md/escapeCurly';
import fm from 'front-matter';
const extname = p.default.extname;

const defaultOpts = {
  parser: md => md,
  markdownOptions: {},
  extension: '.svexy',
};

export interface svexOptions {
  parser?: Function;
  markdownOptions?: object;
  extension?: string;
  layout?: boolean | string;
}

export function mdsvex({
  parser = md => md,
  markdownOptions = {},
  extension = '.svexy',
  layout,
}: svexOptions = defaultOpts) {
  // this allows the user to modify the instance of markdown-it
  // necessary if they want to add custom plugins, etc.
  const md = parser(new MarkdownIt({ ...markdownOptions, html: true }))
    .use(svelte)
    .use(escapeCurly)
    .use(codeExec);
  // store the executable script content on the md object
  // there isn't really a greta place to store this
  md.svx = [];
  md.svxmod = [];

  return {
    markup: ({ content, filename }) => {
      if (extname(filename) !== extension) return;

      const { attributes, body } = fm(content);
      let html = md.render(body);

      // we don't want a script tag to be appended if there is no script content
      // that could cause problems when svelte compiles the component
      let scripts = '';
      let modules = '';

      const isAttributes = Object.keys(attributes).length > 0;
      const isExec = md.svx.length > 0;
      const isMod = md.svxmod.length > 0;

      if (isAttributes || isExec || isMod) {
        if (isExec) {
          scripts += `${md.svx.join('')}`;
        }

        if (isMod) {
          modules += `${md.svxmod.join('')}`;
          modules = '\n<script context="module">\n' + modules + '\n</script>';
        }

        // this makes yaml front-matter available in the component if any is present
        // I'm not sure if these should be available as individual variables
        // concerned about clashes
        if (isAttributes) {
          scripts += `const _fm = ${JSON.stringify(attributes)};`;
        }
      }

      // front-matter defined layouts get priority
      let layoutComponent = attributes.layout || layout;

      // import the layout but it could still be undefined
      scripts += layoutComponent
        ? `\nimport Layout from '${layoutComponent}';`
        : '';

      // and wrap the html with it, if it exists
      html = layoutComponent
        ? `\n<Layout ${isAttributes ? '{..._fm}' : ''}>\n` +
          html.trim() +
          '\n</Layout>\n'
        : html;

      scripts =
        isExec || isAttributes || layoutComponent
          ? '\n<script>\n' + scripts + '\n</script>'
          : '';

      // reset the script and modules or we're in trouble
      md.svx = [];
      md.svxmod = [];

      return {
        code: `${html}${scripts}${modules}`,
        map: '',
      };
    },
  };
}
