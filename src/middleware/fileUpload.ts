import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Only allow CSV files
  if (file.mimetype === 'text/csv' || 
      file.mimetype === 'application/csv' || 
      file.originalname.toLowerCase().endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new ValidationError('Only CSV files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Only one file at a time
  },
});

export const uploadCSV = upload.single('csvFile');

/**
 * Middleware to handle CSV file upload and convert to text content
 */
export const processCSVUpload = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (req.file) {
      // Convert buffer to string
      const csvContent = req.file.buffer.toString('utf-8');
      
      // Add CSV content to request body
      req.body.csvContent = csvContent;
      req.body.originalFilename = req.file.originalname;
      req.body.fileSize = req.file.size;
      
      logger.debug(`CSV file uploaded: ${req.file.originalname} (${req.file.size} bytes)`);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to handle multer errors
 */
export const handleUploadErrors = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return next(new ValidationError('File size too large. Maximum size is 5MB.'));
      case 'LIMIT_FILE_COUNT':
        return next(new ValidationError('Too many files. Only one file is allowed.'));
      case 'LIMIT_UNEXPECTED_FILE':
        return next(new ValidationError('Unexpected file field. Use "csvFile" field name.'));
      default:
        return next(new ValidationError(`File upload error: ${error.message}`));
    }
  }
  
  next(error);
};