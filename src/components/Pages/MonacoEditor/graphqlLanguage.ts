import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'

let registered = false

export function registerGraphQLLanguage() {
  if (registered) return
  registered = true

  monaco.languages.register({ id: 'graphql' })

  monaco.languages.setMonarchTokensProvider('graphql', {
    defaultToken: '',
    tokenPostfix: '.graphql',

    keywords: [
      'query', 'mutation', 'subscription', 'fragment', 'on', 'type', 'interface',
      'union', 'enum', 'input', 'schema', 'extend', 'implements', 'scalar',
    ],

    operators: ['=', '!', '?', ':', '&', '|'],

    symbols: /[=!?:&|]+/,

    tokenizer: {
      root: [
        [/[a-z_$][\w$]*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],
        [/[A-Z][\w$]*/, 'type.identifier'],
        [/".*?"/, 'string'],
        [/'.*?'/, 'string'],
        [/#.*$/, 'comment'],
        [/\{/, '@push', 'block'],
        [/\}/, '@pop'],
        [/@symbols/, 'operator'],
        [/\d+\.\d+|\d+/, 'number'],
      ],
      block: [
        [/[a-z_$][\w$]*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],
        [/[A-Z][\w$]*/, 'type.identifier'],
        [/".*?"/, 'string'],
        [/'.*?'/, 'string'],
        [/#.*$/, 'comment'],
        [/\{/, '@push', 'block'],
        [/\}/, '@pop'],
        [/@symbols/, 'operator'],
      ],
    },
  })
}
