// Import necessary modules
const express = require('express'); // Web framework
const multer = require('multer'); // Middleware for handling file uploads
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3'); // AWS S3 SDK v3 commands
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner'); // SDK v3 tool for presigned URLs
const path = require('path'); // Node.js module for working with file paths (used for extension checking)

// --- Configuration ---
// !!! IMPORTANT: Replace with the actual name of the S3 bucket you created !!!
const S3_BUCKET_NAME = 'project-file-app-bucket-1414';
// Determine the AWS region. It will try to get it from the environment variable
// (which the EC2 instance might have), otherwise defaults to 'us-east-1'.
// Ensure this matches the region of your S3 bucket and EC2 instance.
const S3_REGION = process.env.AWS_REGION || 'eu-north-1';
// Define allowed file extensions (lowercase)
const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.png', '.jpg', '.jpeg'];
// Define the port the web server will listen on. Port 80 is standard HTTP.
const PORT = 80;

// --- Initialization ---
// Create an Express application instance
const app = express();

// Initialize the AWS S3 Client
// By default, the SDK will automatically look for credentials in the environment
// (e.g., environment variables, shared credential file, or EC2 instance profile).
// When running on EC2 with an attached IAM role, it automatically uses that role.
const s3Client = new S3Client({ region: S3_REGION });

// --- Multer Configuration (File Upload Handling) ---
// Configure where Multer stores uploaded files.
// 'memoryStorage' keeps the file content in memory as a Buffer.
// This is simpler for this example as we don't need to write to the EC2 disk first.
const storage = multer.memoryStorage();

// Configure Multer middleware instance
const upload = multer({
    storage: storage, // Use the memory storage defined above
    // Add a file filter function to check extensions before accepting the upload
    fileFilter: (req, file, cb) => {
        // Get the file extension from the original filename
        const ext = path.extname(file.originalname).toLowerCase();
        // Check if the extension is in our allowed list
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            // Reject the file: Pass an error and false
            // The error message will be caught later by our error handling middleware
            cb(new Error(`File type not allowed: ${ext}`), false);
            return;
        }
        // Accept the file: Pass null for the error and true
        cb(null, true);
    }
    // You could add limits here, e.g., fileSize limit: limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}); // The argument 'file' passed to upload.single() later must match the 'name' attribute of the <input type="file"> tag

// --- HTML Template Function ---
// A helper function to generate the HTML page dynamically, including messages and links
const htmlForm = (message = '', downloadUrl = '', uploadedFilename = '') => `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Node File Uploader - Styled</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
            margin: 2em auto; /* Center content */
            max-width: 600px; /* Limit width */
            line-height: 1.6;
            background-color: #f8f9fa;
            color: #212529;
            padding: 1em;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #0056b3;
            text-align: center;
            border-bottom: 2px solid #0056b3;
            padding-bottom: 0.5em;
        }
        h2 {
            color: #198754; /* Green color for success section */
            margin-top: 1.5em;
            border-bottom: 1px solid #198754;
            padding-bottom: 0.3em;
        }
        form {
            margin-top: 1.5em;
            padding: 1.5em;
            background-color: #ffffff;
            border: 1px solid #ced4da;
            border-radius: 5px;
        }
        input[type="file"] {
            display: block;
            margin-bottom: 1em;
            padding: 0.5em;
            border: 1px solid #ced4da;
            border-radius: 4px;
            width: calc(100% - 1.2em); /* Adjust width */
        }
        input[type="submit"] {
            display: block;
            width: 100%;
            padding: 0.75em 1em;
            cursor: pointer;
            background-color: #0d6efd; /* Blue button */
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 1em;
            transition: background-color 0.2s ease;
        }
        input[type="submit"]:hover {
            background-color: #0b5ed7;
        }
        .message { /* Style for the message paragraph */
            padding: 1em;
            margin-bottom: 1em;
            border-radius: 5px;
            text-align: center;
            font-weight: bold;
        }
        .success { /* Class for success messages */
            background-color: #d1e7dd;
            border: 1px solid #badbcc;
            color: #0f5132;
        }
        .error { /* Class for error messages */
            background-color: #f8d7da;
            border: 1px solid #f5c2c7;
            color: #842029;
        }
        small {
            color: #6c757d;
            display: block; /* Ensure it takes its own line */
            text-align: center;
            margin-top: 1em;
        }
        hr {
            margin: 2em 0;
            border: 0;
            border-top: 1px solid #dee2e6;
        }
        a {
            color: #0d6efd;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        #download-section p { /* Style paragraphs in download section */
          margin-bottom: 0.5em;
        }
    </style>
</head>
<body>
    <h1>File Upload Service</h1>

    ${message ? `<p class="message ${message.toLowerCase().includes('error') ? 'error' : 'success'}">${message}</p>` : ''}

    <form method="post" enctype="multipart/form-data" action="/">
        <label for="fileInput">Choose file to upload:</label>
        <input type="file" name="file" id="fileInput" required>
        <input type="submit" value="Upload File">
    </form>

    <p><small>Allowed file types: ${ALLOWED_EXTENSIONS.join(', ')}</small></p>

    ${downloadUrl ? `
    <div id="download-section">
        <hr>
        <h2>Download Your File:</h2>
        <p>Original Filename: <strong>${uploadedFilename}</strong></p>
        <p><a href="${downloadUrl}" target="_blank" rel="noopener noreferrer">Click here to download</a></p>
        <p><small>Link expires in 1 hour.</small></p>
    </div>
    ` : ''}
</body>
</html>
`;

// --- Route Definitions ---

// Handle GET requests to the root URL ('/')
// This displays the initial upload form.
app.get('/', (req, res) => {
    // Send the generated HTML form back to the browser
    res.status(200).send(htmlForm());
});

// Handle POST requests to the root URL ('/')
// This processes the file upload.
// 'upload.single('file')' is the Multer middleware. It expects a single file
// in the form field named 'file'. It processes the upload based on our config
// and makes the file available as 'req.file'.
app.post('/', upload.single('file'), async (req, res) => {

    // Check if Multer successfully processed a file (it might be rejected by fileFilter)
    if (!req.file) {
        // This case usually means the fileFilter rejected the file type
        return res.status(400).send(htmlForm('Error: No file selected or file type not allowed.'));
    }

    // Create a unique filename for S3 to prevent overwriting files with the same name.
    // Prepending the current timestamp is a simple strategy.
    const uniqueFilename = Date.now() + '-' + path.basename(req.file.originalname); // Use path.basename for extra safety

    console.log(`Attempting to upload ${uniqueFilename} (Original: ${req.file.originalname}) to bucket ${S3_BUCKET_NAME}`);

    // Prepare the parameters for the S3 PutObjectCommand
    const putObjectParams = {
        Bucket: S3_BUCKET_NAME,        // Target bucket name
        Key: uniqueFilename,           // The name the file will have in S3
        Body: req.file.buffer,         // The actual file content (as a Buffer from memoryStorage)
        ContentType: req.file.mimetype // Helps browsers interpret the file correctly when downloaded
    };

    try {
        // --- Upload to S3 ---
        console.log("Sending PutObjectCommand to S3...");
        const putCommand = new PutObjectCommand(putObjectParams);
        const putResult = await s3Client.send(putCommand); // Use await as this is asynchronous
        console.log(`Successfully uploaded ${uniqueFilename}. S3 Response ETag: ${putResult.ETag}`);

        // --- Generate Presigned Download URL ---
        console.log("Generating presigned URL...");
        const getObjectParams = {
            Bucket: S3_BUCKET_NAME,
            Key: uniqueFilename,
            // You can force download by setting ResponseContentDisposition:
            // ResponseContentDisposition: `attachment; filename="${req.file.originalname}"`
        };
        const getCommand = new GetObjectCommand(getObjectParams);

        // Generate the URL, valid for 1 hour (3600 seconds)
        const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        console.log("Presigned URL generated.");

        // --- Send Success Response ---
        // Render the HTML form again, now including the success message and download link
        res.status(200).send(htmlForm(
            'File successfully uploaded!',
            downloadUrl,
            req.file.originalname // Pass original name for display
        ));

    } catch (error) {
        // --- Handle Errors ---
        console.error("Error during S3 operation or URL generation:", error);
        // Send an error response back to the user
        res.status(500).send(htmlForm(`Error processing file: ${error.message || 'Unknown server error'}`));
    }
});

// --- Global Error Handling Middleware ---
// This middleware catches errors, including those thrown by Multer's fileFilter
app.use((err, req, res, next) => {
    console.error("An error occurred:", err.stack || err); // Log the full error stack

    // Check if it's a Multer error (e.g., file size limit exceeded)
    if (err instanceof multer.MulterError) {
         return res.status(400).send(htmlForm(`Upload Error: ${err.message}`));
    }
    // Check if it's our custom file type error from the filter
    else if (err && err.message && err.message.startsWith('File type not allowed')) {
         return res.status(400).send(htmlForm(`Error: ${err.message}`));
    }
    // Handle other unexpected errors
    else if (err) {
        return res.status(500).send(htmlForm(`Server Error: ${err.message || 'Something went wrong!'}`));
    }
    // If no error, pass control to the next middleware (though none are defined after this)
    next();
});

// --- Start the Server ---
// Make the Express app listen for incoming requests on the specified port
// '0.0.0.0' means it will listen on all available network interfaces (necessary for EC2)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    console.log(`Using S3 Bucket: ${S3_BUCKET_NAME}, Region: ${S3_REGION}`);
});