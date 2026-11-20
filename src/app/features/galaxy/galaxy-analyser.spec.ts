import { Injector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { syntheticPapers } from '../../../testing/galaxy.fixture';
import {
  GalaxyInput,
  GalaxyRequest,
  GalaxyResponse,
  handleGalaxyRequest,
} from './analysis/galaxy-analysis';
import { AnalysedGalaxy, GALAXY_WORKER, GalaxyAnalyser, GalaxyWorker } from './galaxy-analyser';

const input: GalaxyInput = {
  query: 'drone AND delivery',
  papers: syntheticPapers(5),
  currentYear: 2026,
  width: 600,
  height: 340,
};

/** Stands in for the worker: answers each message when told to, with the real analysis. */
class FakeWorker implements GalaxyWorker {
  readonly received: GalaxyRequest[] = [];
  terminated = false;
  private readonly listeners: Record<string, ((event: never) => void)[]> = {};

  postMessage(message: GalaxyRequest): void {
    this.received.push(message);
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  answer(response: GalaxyResponse): void {
    for (const listener of this.listeners['message'] ?? []) {
      listener({ data: response } as never);
    }
  }

  crash(): void {
    for (const listener of this.listeners['error'] ?? []) {
      listener({ preventDefault: () => undefined, message: 'boom' } as never);
    }
  }
}

describe('GalaxyAnalyser', () => {
  let worker: FakeWorker | null;
  let created: number;
  let injector: Injector;

  const analyser = () => injector.get(GalaxyAnalyser);

  beforeEach(() => {
    worker = new FakeWorker();
    created = 0;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        GalaxyAnalyser,
        {
          provide: GALAXY_WORKER,
          useValue: () => {
            created++;
            return worker;
          },
        },
      ],
    });
    injector = TestBed.inject(Injector);
  });

  it('starts the worker on first use only, and sends each request with its own id', () => {
    expect(created).toBe(0);

    analyser().analyse(input).subscribe();
    analyser().analyse(input).subscribe();

    expect(created).toBe(1);
    expect(worker!.received.map((r) => r.id)).toEqual([1, 2]);
    expect(worker!.received[0].papers.length).toBe(20);
  });

  it('passes on the answer to the request it belongs to', async () => {
    const result = firstValueFrom(analyser().analyse(input));
    const request = worker!.received[0];
    worker!.answer(handleGalaxyRequest(request));

    const galaxy = await result;
    expect(galaxy.thread).toBe('worker');
    expect(galaxy.topics.length).toBeGreaterThanOrEqual(3);
  });

  it('ignores an answer nobody waits for any more', () => {
    const seen: AnalysedGalaxy[] = [];
    const subscription = analyser()
      .analyse(input)
      .subscribe((galaxy) => seen.push(galaxy));
    subscription.unsubscribe();

    worker!.answer(handleGalaxyRequest(worker!.received[0]));

    expect(seen).toEqual([]);
  });

  it('reports a failed analysis as an error', async () => {
    const result = firstValueFrom(analyser().analyse(input));
    worker!.answer({ id: 1, ok: false, error: 'Bad input' });

    await expectAsync(result).toBeRejectedWithError('Bad input');
  });

  it('runs on the main thread when the worker cannot start', async () => {
    const result = firstValueFrom(analyser().analyse(input));
    worker!.crash();

    expect(worker!.terminated).toBeTrue();
    expect((await result).thread).toBe('main');
    expect((await firstValueFrom(analyser().analyse(input))).thread).toBe('main');
    expect(created).toBe(1);
  });

  it('runs on the main thread where there are no workers', async () => {
    worker = null;

    expect((await firstValueFrom(analyser().analyse(input))).thread).toBe('main');
  });

  it('stops the worker with the page', () => {
    analyser().analyse(input).subscribe();
    TestBed.resetTestingModule();

    expect(worker!.terminated).toBeTrue();
  });
});

describe('GalaxyAnalyser with the real worker', () => {
  it('finds the topics off the main thread', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), GalaxyAnalyser],
    });

    const galaxy = await firstValueFrom(TestBed.inject(GalaxyAnalyser).analyse(input));

    expect(galaxy.thread).toBe('worker');
    expect(galaxy.topics.length).toBeGreaterThanOrEqual(3);
    expect(galaxy.x.length).toBe(20);
  });
});
