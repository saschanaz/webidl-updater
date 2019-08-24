const similarDict = {
  "&gt;": ">",
  "=\"\"": "",
  "\"": "'"
};

/**
 * @param {string} input
 * @param {string} target
 */
function similarSearch(input, target) {
  const similarMatches = {};

  function similarMatch(index) {
    const initialPosition = index;
    for (let i = 0; i < target.length; index++, i++) {
      const inputCh = input[index];
      const targetCh = target[i];
      if (inputCh !== targetCh) {
        let matched = false;
        for (const [key, value] of Object.entries(similarDict)) {
          if (targetCh === key[0] && target.slice(i, i + key.length) === key) {
            if (!value || inputCh === value) {
              i += key.length - 1;
              index += value.length - 1;
              matched = true;
              similarMatches[key] = value;
              break;
            }
          }
        }
        if (!matched) {
          return 0;
        }
      }
    }
    return index - initialPosition;
  }

  if (!target) {
    return;
  }

  let lastIndex = -1;
  while (true) {
    const index = input.indexOf(target[0], lastIndex + 1);
    if (index === -1) {
      return;
    }
    lastIndex = index;

    const matchedLength = similarMatch(index);
    if (matchedLength) {
      return {
        index,
        length: matchedLength,
        similarMatches
      };
    };
  }
}

function stringSplice(input, index, length, dest) {
  const first = input.slice(0, index);
  const last = input.slice(index + length);
  return first + dest + last;
}

/**
 * @param {string} input
 * @param {string} orig
 * @param {string} dest
 */
function similarReplace(input, orig, dest) {
  const match = similarSearch(input, orig);
  if (match) {
    for (const [key, value] of Object.entries(match.similarMatches)) {
      dest = dest.replace(new RegExp(value, "g"), key);
    }
    return stringSplice(input, match.index, match.length, dest);
  } else {
    debugger;
    throw new Error(`Couldn't find a match to replace:\n${orig}`);
  }
}
module.exports.similarReplace = similarReplace;
