import { TOPIC_COLOURS, TOPIC_SHAPES, starPath, topicColour } from './galaxy-palette';

describe('galaxy palette', () => {
  it('has a colour and a shape for each of up to eight topics', () => {
    expect(TOPIC_COLOURS.length).toBe(8);
    expect(new Set(TOPIC_COLOURS).size).toBe(8);
    expect(new Set(TOPIC_SHAPES).size).toBe(8);
    expect(topicColour(0)).toBe('#3987e5');
  });

  it('draws every shape as a closed path centred on the star', () => {
    for (let topic = 0; topic < 8; topic++) {
      const path = starPath(topic, 5);
      const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);

      expect(path)
        .withContext(TOPIC_SHAPES[topic])
        .toMatch(/^M.*Z$/);
      expect(Math.max(...numbers.map(Math.abs)))
        .withContext(TOPIC_SHAPES[topic])
        .toBeLessThan(10);
    }
  });
});
