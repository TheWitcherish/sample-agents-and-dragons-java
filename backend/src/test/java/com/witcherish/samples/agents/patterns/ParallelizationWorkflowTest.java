package com.witcherish.samples.agents.patterns;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ParallelizationWorkflowTest {

    @Test
    void runsWorkersTogetherAndKeepsInputOrder() {
        // Every worker waits for all three to start: only true parallelism gets past the latch.
        CountDownLatch allStarted = new CountDownLatch(3);

        List<String> out = ParallelizationWorkflow.parallel(List.of("a", "b", "c"), input -> {
            allStarted.countDown();
            try {
                assertTrue(allStarted.await(5, TimeUnit.SECONDS), "workers did not run in parallel");
            } catch (InterruptedException e) {
                throw new IllegalStateException(e);
            }
            return input.toUpperCase();
        }, 3);

        assertEquals(List.of("A", "B", "C"), out);
    }

    @Test
    void surfacesAWorkerFailure() {
        assertThrows(RuntimeException.class, () -> ParallelizationWorkflow.parallel(
                List.of("ok", "boom"),
                input -> {
                    if (input.equals("boom")) throw new IllegalStateException("boom");
                    return input;
                }, 2));
    }
}
