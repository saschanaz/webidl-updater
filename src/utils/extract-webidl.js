// Copyright (c) 2016 François Daoust
// Licensed under the MIT license

/**
 * Extract IDL definitions from a ReSpec spec, and in practice from
 * most other specs as well.
 *
 * The function tries all known patterns used to define IDL content, making
 * sure that it only extracts elements once.
 */
function extractIdl(document) {
    // IDL filter voluntarily similar to that defined in Respec to exclude
    // IDL defined with an `exclude` class:
    // https://github.com/w3c/respec/blob/develop/src/core/utils.js#L69
    // https://tabatkins.github.io/bikeshed/#metadata-informative-classes
    const nonNormativeSelector = [
        '.informative', '.note', '.issue', '.example', '.ednote', '.practice',
        '.introductory', '.non-normative'
    ].join(',');

    // Detect the IDL index appendix if there's one (to exclude it)
    const idlEl = document.querySelector('#idl-index pre') ||
        document.querySelector('.chapter-idl pre'); // SVG 2 draft

    let queries = [
        'pre.idl:not(.exclude):not(.extract):not(#actual-idl-index)',
        'pre:not(.exclude):not(.extract) > code.idl-code:not(.exclude):not(.extract)',
        'pre:not(.exclude):not(.extract) > code.idl:not(.exclude):not(.extract)',
        'div.idl-code:not(.exclude):not(.extract) > pre:not(.exclude):not(.extract)',
        'pre.widl:not(.exclude):not(.extract)',
        'idl[xml:space="preserve"]' // WebGL extensions
    ];
    queries = queries.concat(queries.map(q => q.replace(/pre/g, "xmp")));

    /** @type {Element[]} */
    const blocks = queries
        .map(sel => [...document.querySelectorAll(sel)])
        .reduce((res, elements) => res.concat(elements), [])
        .filter(el => el !== idlEl)
        .filter(el => !el.previousElementSibling || el.previousElementSibling.id !== 'idl-index')
        .filter((el, idx, self) => self.indexOf(el) === idx)
        .filter(el => !el.closest(nonNormativeSelector))
        .map(el => el.cloneNode(true))
        .map(el => {
            const header = el.querySelector('.idlHeader');
            if (header) {
                header.remove();
            }
            const tests = el.querySelector('details.respec-tests-details');
            if (tests) {
                tests.remove();
            }
            return el;
        });
    let idl = blocks.map(el => el.textContent)
    return { blocks, idl };
}

module.exports = extractIdl;
