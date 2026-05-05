const fs         = require('fs');
const path       = require('path');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const express    = require('express');
const mongoose   = require('mongoose');
const dotenv     = require('dotenv');

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

// Behind Render (and other proxies); keeps sessions / HTTPS behavior correct
app.set('trust proxy', 1);

// ensure uploads folder exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// view engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import middlewares
const localsMiddleware = require('./middleware/locals');
const { handleErrors } = require('./middleware/error-handler');

// Models
const Recipe = require('./models/Recipe');

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'a really secret key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make req.session.user, isAuthenticated and path available in all views
app.use(localsMiddleware.setLocals);

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Home route now uses EJS and injects recipes
app.get('/', async (req, res, next) => {
  try {
    const recipes = await Recipe.aggregate([
      {
        $lookup: {
          from: 'ratings',
          localField: '_id',
          foreignField: 'recipe',
          as: 'ratings'
        }
      },
      {
        $addFields: {
          averageRating: {
            $cond: [
              { $gt: [{ $size: '$ratings' }, 0] },
              { $avg: '$ratings.value' },
              0
            ]
          }
        }
      },
      { $sort: { averageRating: -1 } },
      { $limit: 10 },
      { $project: { ratings: 0 } }
    ]);

    res.render('index', { recipes });
  } catch (err) {
    next(err);
  }
});

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch(err => console.error('MongoDB connection error:', err));

// Route handlers
const recipeRoutes  = require('./routes/recipes');
const commentRoutes = require('./routes/comment');
const ratingRoutes  = require('./routes/rating');
const authRoutes    = require('./routes/auth');

app.use('/recipes', recipeRoutes);
app.use('/comments', commentRoutes);
app.use('/ratings', ratingRoutes);
app.use('/', authRoutes);

// Error handling middleware
app.use(handleErrors);

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
