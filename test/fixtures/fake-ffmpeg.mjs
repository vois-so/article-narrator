// A fake ffmpeg for the tests. The measure pass prints loudnorm JSON. The
// encode pass writes a small file that starts with an ID3 header.
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.includes('null')) {
  process.stderr.write('[Parsed_loudnorm_0]\n{\n "input_i" : "-20.0",\n "input_tp" : "-3.0",\n "input_lra" : "4.0",\n'
    + ' "input_thresh" : "-30.0",\n "target_offset" : "0.5"\n}\n');
  process.exit(0);
}
const inputs = args.filter((a, i) => args[i - 1] === '-i');
writeFileSync(args[args.length - 1], Buffer.concat([Buffer.from('ID3'), Buffer.from(JSON.stringify({ inputs: inputs.length }))]));
process.exit(0);
