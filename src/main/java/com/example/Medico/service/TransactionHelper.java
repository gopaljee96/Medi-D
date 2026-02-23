package com.example.Medico.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

/**
 * Service for managing transactions manually (programmatically).
 * Provides an alternative to @Transactional annotation.
 * Useful when client needs explicit control over transaction boundaries.
 */
@Service
public class TransactionHelper {

    @Autowired
    private PlatformTransactionManager transactionManager;

    /**
     * Execute operation within a transaction
     * Example usage:
     * 
     * transactionHelper.executeInTransaction(() -> {
     *     // Your operation here
     *     repository.save(entity);
     * });
     */
    public <T> T executeInTransaction(TransactionalOperation<T> operation) throws Exception {
        // Create transaction definition
        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setName("ManualTransaction");
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        def.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);

        // Get transaction status
        TransactionStatus status = transactionManager.getTransaction(def);

        try {
            // Execute operation
            T result = operation.execute();
            // Commit if successful
            transactionManager.commit(status);
            return result;
        } catch (Exception e) {
            // Rollback on exception
            if (!status.isCompleted()) {
                transactionManager.rollback(status);
            }
            throw new RuntimeException("Transaction failed: " + e.getMessage(), e);
        }
    }

    /**
     * Execute operation within a transaction (void operation)
     */
    public void executeInTransactionVoid(VoidTransactionalOperation operation) throws Exception {
        executeInTransaction(() -> {
            operation.execute();
            return null;
        });
    }

    /**
     * Functional interface for transactional operation that returns a value
     */
    @FunctionalInterface
    public interface TransactionalOperation<T> {
        T execute() throws Exception;
    }

    /**
     * Functional interface for transactional operation that returns void
     */
    @FunctionalInterface
    public interface VoidTransactionalOperation {
        void execute() throws Exception;
    }

    /**
     * Execute with custom isolation level
     */
    public <T> T executeInTransaction(TransactionalOperation<T> operation, int isolationLevel) throws Exception {
        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setName("ManualTransaction");
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        def.setIsolationLevel(isolationLevel);

        TransactionStatus status = transactionManager.getTransaction(def);

        try {
            T result = operation.execute();
            transactionManager.commit(status);
            return result;
        } catch (Exception e) {
            if (!status.isCompleted()) {
                transactionManager.rollback(status);
            }
            throw new RuntimeException("Transaction failed with isolation level " + isolationLevel + ": " + e.getMessage(), e);
        }
    }

    /**
     * Execute with read-only flag
     */
    public <T> T executeInReadOnlyTransaction(TransactionalOperation<T> operation) throws Exception {
        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setName("ReadOnlyTransaction");
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        def.setReadOnly(true);

        TransactionStatus status = transactionManager.getTransaction(def);

        try {
            T result = operation.execute();
            transactionManager.commit(status);
            return result;
        } catch (Exception e) {
            if (!status.isCompleted()) {
                transactionManager.rollback(status);
            }
            throw new RuntimeException("Read-only transaction failed: " + e.getMessage(), e);
        }
    }
}