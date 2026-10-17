import assert from "node:assert/strict";
import { test } from "node:test";
import { fileName } from "../util.js";

test("file names come from Windows and POSIX paths alike", () => {
  assert.equal(fileName("C:\\Users\\lab\\reference\\ambit\\Ambit raw data_sample_150_pl1.csv"), "Ambit raw data_sample_150_pl1.csv");
  assert.equal(fileName("/home/lab/reference/ambit/Ambit raw data_sample_150_pl2.csv"), "Ambit raw data_sample_150_pl2.csv");
  assert.equal(fileName("C:\\data/sessions\\s1/aligned.csv"), "aligned.csv");
});
