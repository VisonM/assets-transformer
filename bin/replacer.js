#!/usr/bin/env node

const glob = require("fast-glob");
const cli = require("cac")();
const fs = require("node:fs");
const { parse } = require("node:url");
const request = require("request");
const ora = require("ora");
const { parseDomain } = require("parse-domain");

cli.option("--entry <entry>", "start replace entry, support regex", {
  default: "src/*",
});
cli.option("--upload <entry>", "transform domain", {
  default: "https://upload.readomglobal.com/upload/",
});

const bucket = {
  img: "image",
  media: "media",
};
const { options } = cli.parse();

const resolveSingleFile = async (filePath) => {
  const content = fs.readFileSync(filePath, "utf-8");
  const pending = [];
  const { host } = parse(options.upload);
  const { domain, topLevelDomains } = parseDomain(host);
  const rootDomainRegex = `.${domain}.${topLevelDomains.join(".")}`.replace(
    /[-\/\\^$*+?.()|[\]{}]/g,
    "\\$&"
  );
  const regex = new RegExp(
    `(["'(])(https?:\/\/(img|media)(?!${rootDomainRegex}).*\\.[^"')]*)(["')])`,
    "g"
  );
  content.replace(regex, (_, start, match, __, end) => {
    pending.push(replaceMatch(match, start, end));
  });
  const results = await Promise.all(pending);
  const newContent = content.replace(regex, () => results.shift());
  fs.writeFileSync(filePath, newContent, "utf-8");
};

const replaceMatch = (url, start, end) => {
  return new Promise((resolve) => {
    const ext = url.split(".").pop();
    const { host } = parse(url);
    const { subDomains } = parseDomain(host);
    const uploadUrl = `${options.upload}${bucket[subDomains.pop()]}?sufix=${ext}`;
    request.get(url).pipe(
      request.put(uploadUrl, (_, _res, body) => {
        const data = JSON.parse(body);
        resolve(`${start}${data.url}${end}`);
      })
    );
  });
};

async function main() {
  const spinner = ora("transform...").start();
  const entrys = glob.sync(options.entry, { absolute: true });
  await Promise.all(entrys.map(resolveSingleFile));
  spinner.succeed();
}

main();
