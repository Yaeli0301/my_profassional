const { logger } = require('../../../utils/logger');

module.exports = {
  name: 'initial-optimization',
  description: 'Initial database optimization including indexes and schema updates',

  async up(db) {
    logger.info('Running initial optimization migration');

    try {
      // Create indexes for User collection
      await db.collection('users').createIndexes([
        { key: { email: 1 }, unique: true },
        { key: { role: 1 } },
        { key: { createdAt: 1 } },
        { key: { 'profile.phone': 1 } }
      ]);
      logger.info('Created indexes for users collection');

      // Create indexes for Professional collection
      await db.collection('professionals').createIndexes([
        { key: { userId: 1 }, unique: true },
        { key: { categories: 1 } },
        { key: { 'location.city': 1 } },
        { key: { rating: -1 } },
        { key: { isAvailable: 1 } }
      ]);
      logger.info('Created indexes for professionals collection');

      // Create indexes for Appointments collection
      await db.collection('appointments').createIndexes([
        { key: { professionalId: 1 } },
        { key: { userId: 1 } },
        { key: { date: 1 } },
        { key: { status: 1 } },
        { key: { 
          professionalId: 1, 
          date: 1, 
          status: 1 
        } }
      ]);
      logger.info('Created indexes for appointments collection');

      // Create indexes for Services collection
      await db.collection('services').createIndexes([
        { key: { professionalId: 1 } },
        { key: { category: 1 } },
        { key: { price: 1 } },
        { key: { duration: 1 } }
      ]);
      logger.info('Created indexes for services collection');

      // Create indexes for Comments collection
      await db.collection('comments').createIndexes([
        { key: { professionalId: 1 } },
        { key: { userId: 1 } },
        { key: { rating: -1 } },
        { key: { createdAt: -1 } }
      ]);
      logger.info('Created indexes for comments collection');

      // Create indexes for Categories collection
      await db.collection('categories').createIndexes([
        { key: { name: 1 }, unique: true },
        { key: { parent: 1 } }
      ]);
      logger.info('Created indexes for categories collection');

      // Create indexes for Cities collection
      await db.collection('cities').createIndexes([
        { key: { name: 1 }, unique: true },
        { key: { region: 1 } }
      ]);
      logger.info('Created indexes for cities collection');

      // Update user schema - add new fields and convert existing ones
      await db.collection('users').updateMany(
        {},
        {
          $set: {
            isActive: true,
            lastLoginAt: null,
            settings: {
              notifications: {
                email: true,
                push: true
              },
              language: 'he',
              timezone: 'Asia/Jerusalem'
            }
          },
          $rename: {
            'name': 'profile.name',
            'phone': 'profile.phone'
          }
        }
      );
      logger.info('Updated user schema');

      // Update professional schema - add new fields
      await db.collection('professionals').updateMany(
        {},
        {
          $set: {
            isVerified: false,
            verificationStatus: 'pending',
            availability: {
              schedule: [],
              exceptions: []
            },
            statistics: {
              totalAppointments: 0,
              completedAppointments: 0,
              cancelledAppointments: 0,
              averageRating: 0,
              totalReviews: 0
            }
          }
        }
      );
      logger.info('Updated professional schema');

      // Update appointments schema - add new fields
      await db.collection('appointments').updateMany(
        {},
        {
          $set: {
            paymentStatus: 'pending',
            reminderSent: false,
            notes: '',
            history: []
          }
        }
      );
      logger.info('Updated appointments schema');

      // Clean up orphaned documents
      await this.cleanupOrphanedDocuments(db);
      logger.info('Cleaned up orphaned documents');

      // Update database statistics
      await db.command({ analyzeShardKey: 'users' });
      await db.command({ analyzeShardKey: 'professionals' });
      await db.command({ analyzeShardKey: 'appointments' });
      logger.info('Updated database statistics');

    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  },

  async down(db) {
    logger.info('Rolling back initial optimization migration');

    try {
      // Drop created indexes
      await db.collection('users').dropIndexes();
      await db.collection('professionals').dropIndexes();
      await db.collection('appointments').dropIndexes();
      await db.collection('services').dropIndexes();
      await db.collection('comments').dropIndexes();
      await db.collection('categories').dropIndexes();
      await db.collection('cities').dropIndexes();
      logger.info('Dropped all created indexes');

      // Revert user schema changes
      await db.collection('users').updateMany(
        {},
        {
          $unset: {
            isActive: "",
            lastLoginAt: "",
            settings: ""
          },
          $rename: {
            'profile.name': 'name',
            'profile.phone': 'phone'
          }
        }
      );
      logger.info('Reverted user schema changes');

      // Revert professional schema changes
      await db.collection('professionals').updateMany(
        {},
        {
          $unset: {
            isVerified: "",
            verificationStatus: "",
            availability: "",
            statistics: ""
          }
        }
      );
      logger.info('Reverted professional schema changes');

      // Revert appointments schema changes
      await db.collection('appointments').updateMany(
        {},
        {
          $unset: {
            paymentStatus: "",
            reminderSent: "",
            notes: "",
            history: ""
          }
        }
      );
      logger.info('Reverted appointments schema changes');

    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  },

  async cleanupOrphanedDocuments(db) {
    // Remove appointments without valid professional or user
    await db.collection('appointments').deleteMany({
      $or: [
        {
          professionalId: {
            $nin: await db.collection('professionals')
              .distinct('_id')
          }
        },
        {
          userId: {
            $nin: await db.collection('users')
              .distinct('_id')
          }
        }
      ]
    });

    // Remove comments without valid professional or user
    await db.collection('comments').deleteMany({
      $or: [
        {
          professionalId: {
            $nin: await db.collection('professionals')
              .distinct('_id')
          }
        },
        {
          userId: {
            $nin: await db.collection('users')
              .distinct('_id')
          }
        }
      ]
    });

    // Remove services without valid professional
    await db.collection('services').deleteMany({
      professionalId: {
        $nin: await db.collection('professionals')
          .distinct('_id')
      }
    });

    // Remove professionals without valid user
    await db.collection('professionals').deleteMany({
      userId: {
        $nin: await db.collection('users')
          .distinct('_id')
      }
    });
  }
};
