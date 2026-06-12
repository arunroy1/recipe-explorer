require('dotenv').config();          

const express             = require('express');
const S3                  = require('aws-sdk/clients/s3');  
const multer              = require('multer');
const multerS3            = require('multer-s3');
const router              = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const recipesController   = require('../controllers/recipesController');

// Instantiate v2 S3 client
const s3 = new S3({
  region:          process.env.AWS_REGION,
  accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Sanity check: must print your bucket name (or 'undefined')
console.log('> S3_BUCKET is:', process.env.S3_BUCKET);

// Use S3 when configured, otherwise fall back to local disk storage so the
// app runs in local development without AWS credentials.
const storage = process.env.S3_BUCKET
  ? multerS3({
      s3,
      bucket: process.env.S3_BUCKET,
      key(req, file, cb) {
        const filename = `recipes/${Date.now()}_${file.originalname}`;
        cb(null, filename);
      }
    })
  : (() => {
      const path = require('path');
      const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
      const diskStorage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) =>
          cb(null, `${Date.now()}_${file.originalname}`)
      });
      // Expose a public URL on req.file.location to match the multer-s3 shape.
      const wrapped = Object.create(diskStorage);
      wrapped._handleFile = (req, file, cb) => {
        diskStorage._handleFile(req, file, (err, info) => {
          if (err) return cb(err);
          info.location = `/uploads/${info.filename}`;
          cb(null, info);
        });
      };
      return wrapped;
    })();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max file size
});

// 1) HTML page at GET /recipes
router.get('/', recipesController.showAllRecipesPage);

// 2) JSON API at GET /recipes/api
router.get('/api', recipesController.getAllRecipes);

// 3) Show Add Recipe form
router.get('/addrecipe', isAuthenticated, recipesController.showAddForm);

// 4) Handle Add Recipe POST (upload to S3)
router.post(
  '/addrecipe',
  isAuthenticated,
  upload.single('image'),
  recipesController.createRecipe
);

// 5) Show one recipe (HTML)
router.get('/:id', recipesController.showRecipe);

// 6) PUT update (JSON)
router.put('/:id', isAuthenticated, recipesController.updateRecipe);

// 7) DELETE (JSON)
router.delete('/:id', isAuthenticated, recipesController.deleteRecipe);

module.exports = router;
