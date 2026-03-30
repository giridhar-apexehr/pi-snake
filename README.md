# @<scope>/pi-snake

Snake extension package for [pi](https://github.com/badlogic/pi-mono).

## Install

```bash
pi install npm:@<scope>/pi-snake
```

Or project-local:

```bash
pi install -l npm:@<scope>/pi-snake
```

## Included resources

This package exposes extensions through the `pi` manifest in `package.json`:

```json
{
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

Current extension entrypoint:

- `extensions/snake/index.ts`

## Development

```bash
npm install
```

Optional typecheck:

```bash
npx tsc --noEmit
```

## Publish checklist

1. Replace `<scope>` in `package.json` and this README.
2. Update `version` as needed.
3. Verify extension behavior in pi.
4. Publish:

```bash
npm publish --access public
```

## License

MIT
