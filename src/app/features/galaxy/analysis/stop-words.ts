/**
 * Words that say nothing about what a paper is about: English function words, and the filler
 * that fills academic abstracts ("this paper proposes a novel approach based on…"). They are
 * dropped before topics are found, so they can neither group papers nor name a topic.
 *
 * Deliberately not listed: "last" and "first", which carry meaning in phrases such as
 * "last mile". Generic research nouns ("system", "framework", "problem") are listed: they appear in
 * every field, and as topic names they say nothing.
 */
const ENGLISH = `
a about above after again against all almost alone along already although always am among an and
another any anyone anything are around as at be became because become becomes been before being
below between both but by can cannot could did do does doing done down during each either else
enough etc even ever every for from further had has have having he her here hers herself him
himself his how however i if in into is it its itself just least less like many may me might more
most much must my myself neither no nor not now of off often on once one only onto or other others
our ours ourselves out over own per perhaps quite rather same shall she should since so some such
than that the their theirs them themselves then there therefore these they this those though
through thus to too toward towards under until up upon us very via was we were what whatever when
where whereas whether which while who whom whose why will with within without would yet you your
yours yourself
`;

const ACADEMIC_FILLER = `
abstract according achieve achieved addition additionally address addressed addresses aim aimed
aims al allow allowed allows also analyse analysed analyses analysis analyze analyzed application
applications approach approaches article aspect aspects available based best better carried case
cases challenge challenges chapter compared comparing comparison concept concepts conclusion
conclusions conduct conducted consider considered considering considers current currently
demonstrate demonstrated demonstrates describe described describes development different discuss
discussed discusses due effective effectively eg enable enabled enables especially et evaluate
evaluated evaluates evaluation examine examined examines example examples existing explore explored
explores factor factors find finding findings finds focus focused focuses found framework
frameworks furthermore given good high higher highly ie implementation important include included
includes including introduce introduced introduces investigate investigated investigates
investigation issue issues key known large larger lastly low lower main mainly major make makes
making method methodology methods model models moreover multi multiple namely need needed needs new
non novel number numerous obtain obtained order overall overview paper papers part particular
particularly perform performed possible potential potentially pre present presented presents
previous previously problem problems process processes project projects propose proposed proposes
provide provided provides providing purpose recent recently regarding related relevant research
researchers respectively result resulting results review reviewed reviews section semi several show
showed shown shows significant significantly similar single small smaller solution solutions
specific specifically still strategies strategy studied studies study sub suggest suggested
suggests system systems take taken technique techniques technologies technology terms thesis three
two type types use used useful uses using various way ways well work works
`;

export const STOP_WORDS: ReadonlySet<string> = new Set(
  `${ENGLISH} ${ACADEMIC_FILLER}`.split(/\s+/).filter(Boolean),
);
