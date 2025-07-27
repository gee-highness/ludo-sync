// the-chair-app/lib/sanityLogger.ts
import { client } from './sanity';
import { logger as appLogger } from './logger'; // Import our existing application logger

interface SanityLogDetails {
  payload?: any;
  oldValue?: any;
  newValue?: any;
  query?: string;
  errorDetails?: any;
  durationMs?: number;
  resultCount?: number; // <--- ADDED THIS LINE
  createAccountIntent?: boolean; // Added for booking form
}

/**
 * Logs an interaction with Sanity (or a significant application event) to a dedicated
 * 'sanityLog' document type within Sanity itself.
 * This provides an audit trail and data for business metrics.
 *
 * @param operationType The type of operation (e.g., 'create', 'update', 'fetch', 'bookingAttempt').
 * @param message A brief summary message for the log.
 * @param documentType The Sanity document type affected (e.g., 'appointment', 'customer').
 * @param documentId The _id of the document affected, if applicable.
 * @param userId The ID of the user/actor performing the action (e.g., customerId, barberId, 'system').
 * @param success Boolean indicating if the operation was successful.
 * @param details Optional object for additional structured data.
 */
export async function logSanityInteraction(
  operationType: string,
  message: string,
  documentType?: string,
  documentId?: string,
  userId?: string,
  success: boolean = true,
  details?: SanityLogDetails
) {
  try {
    // Use a Sanity client with a token for write operations
    // Ensure SANITY_API_TOKEN is set in your .env.local and deployment environment
    const clientWithToken = client.withConfig({
      token: process.env.NEXT_PUBLIC_SANITY_API_WRITE_TOKEN,
      useCdn: false, // Always ensure fresh data and write capabilities
    });

    const logDocument = {
      _type: 'sanityLog',
      timestamp: new Date().toISOString(),
      operationType,
      message,
      documentType: documentType || 'N/A',
      documentId: documentId || 'N/A',
      userId: userId || 'anonymous', // Default to 'anonymous' if no user ID provided
      success,
      details: details || {},
    };

    await clientWithToken.create(logDocument);
    // FIX: Changed appLogger.debug to appLogger.info
    appLogger.info(`SanityLogger: Logged interaction: ${operationType} - ${message}`);
  } catch (error: any) {
    // Use the application logger (Winston) to log errors in the logging process itself
    appLogger.error('SanityLogger: Failed to log interaction to Sanity:', {
      operationType,
      message,
      documentType,
      documentId,
      userId,
      success,
      details,
      loggingError: error.message, // Add details about the logging error itself
    });
  }
}
