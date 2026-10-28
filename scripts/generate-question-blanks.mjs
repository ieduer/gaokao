import { readFile, writeFile } from 'node:fs/promises';
import { projectScopedAnswers } from './lib/answer-release-scope.mjs';
import { buildQuestionBlanksModule, QUESTION_BLANKS_PATH } from './lib/question-blanks.mjs';

const load = async name => JSON.parse(await readFile(`data/${name}.json`, 'utf8'));
const [records, authority, scope, preserved, definition, sourceMarks] = await Promise.all([
  'all', 'answer-authority', 'answer-release-scope', 'answer-release-preserved', 'question-blanks', 'question-source-marks',
].map(load));
const source = buildQuestionBlanksModule(projectScopedAnswers(records, authority, scope, preserved), definition, sourceMarks);
await writeFile(QUESTION_BLANKS_PATH, source);
console.log(`Generated ${QUESTION_BLANKS_PATH} from ${definition.sourceQuestions.length} canonical questions`);
