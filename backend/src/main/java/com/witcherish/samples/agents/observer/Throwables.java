package com.witcherish.samples.agents.observer;

/**
 * Tiny exception-message helper. Spring AI / AWS SDK / Bedrock exceptions are
 * typically wrapped multiple layers deep, and the outermost {@code getMessage()}
 * often returns null or just the class name. {@link #rootMessage(Throwable)}
 * walks the cause chain and returns the most useful text it can find.
 *
 * <p>Use this in tool-callback {@code catch} blocks where the exception is being
 * collapsed into a string for the LLM — without it, the orchestrator gets
 * "Error in X: null" prose results that tell nobody anything.
 */
public final class Throwables {

    private Throwables() {}

    /**
     * Walk the {@link Throwable#getCause()} chain to find the deepest non-null
     * exception, then return a {@code "ClassName: message"} string. The class name
     * matters because some Bedrock exceptions ship with a null message but a
     * descriptive type name (e.g., {@code ThrottlingException}).
     */
    public static String rootMessage(Throwable t) {
        if (t == null) return "(null exception)";
        Throwable cur = t;
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        String type = cur.getClass().getSimpleName();
        return (msg == null || msg.isBlank()) ? type : type + ": " + msg;
    }
}
