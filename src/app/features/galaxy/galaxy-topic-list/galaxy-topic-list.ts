import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Paper } from '../../../core/models/paper';
import { GalaxyTopic } from '../analysis/galaxy-analysis';
import { percent } from '../analysis/topic-stats';
import { TOPIC_SHAPES, starPath, topicColour } from '../galaxy-palette';

let nextId = 0;

/** The galaxy as a list: each topic with its numbers and its papers, newest first. */
@Component({
  selector: 'app-galaxy-topic-list',
  templateUrl: './galaxy-topic-list.html',
  styleUrl: './galaxy-topic-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GalaxyTopicList {
  readonly topics = input.required<readonly GalaxyTopic[]>();
  readonly papers = input.required<readonly Paper[]>();
  /** First year counted as recent. */
  readonly since = input.required<number>();

  protected readonly id = `galaxy-topic-list-${nextId++}`;

  protected readonly groups = computed(() => {
    const papers = this.papers();
    return this.topics().map((topic, i) => ({
      topic,
      swatch: starPath(i, 5),
      colour: topicColour(i),
      shape: TOPIC_SHAPES[i % TOPIC_SHAPES.length],
      share: topic.recentShare === null ? null : percent(topic.recentShare),
      papers: topic.papers
        .map((index) => papers[index])
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title)),
    }));
  });
}
