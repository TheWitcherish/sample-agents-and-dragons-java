package com.witcherish.samples.agents.patterns;

import org.springframework.util.Assert;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Function;

/**
 * Parallelization workflow, shaped after the Spring AI reference implementation
 * (<a href="https://github.com/spring-projects/spring-ai-examples/tree/main/agentic-patterns/parallelization-workflow">spring-ai-examples
 * — parallelization-workflow</a>): fan independent inputs out to a fixed pool of
 * {@code nWorkers}, wait for every {@link CompletableFuture}, and return the outputs in input
 * order so a later step can aggregate them programmatically.
 *
 * <p>The reference sends ONE prompt to many inputs through ONE {@code ChatClient}. The Graph
 * pattern uses the "sectioning" variant from Anthropic's Building Effective Agents: each input
 * is a different graph node (its own agent, its own prompt), so the call is a function of the
 * input instead of a fixed prompt. Everything else — pool, fan-out, join, ordered results,
 * failure wrapping — is the reference's.
 */
public final class ParallelizationWorkflow {

    private ParallelizationWorkflow() {
    }

    public static <T> List<String> parallel(List<T> inputs, Function<T, String> worker, int nWorkers) {
        Assert.notEmpty(inputs, "Inputs list cannot be empty");
        Assert.notNull(worker, "Worker cannot be null");
        Assert.isTrue(nWorkers > 0, "Number of workers must be greater than 0");

        ExecutorService executor = Executors.newFixedThreadPool(nWorkers);
        try {
            List<CompletableFuture<String>> futures = inputs.stream()
                    .map(input -> CompletableFuture.supplyAsync(() -> {
                        try {
                            return worker.apply(input);
                        } catch (Exception e) {
                            throw new RuntimeException("Failed to process input: " + input, e);
                        }
                    }, executor))
                    .toList();

            CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();

            return futures.stream().map(CompletableFuture::join).toList();
        } finally {
            executor.shutdown();
        }
    }
}
