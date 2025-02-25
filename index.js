require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 20112;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.qz0m3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const database = client.db("historic-artifact");
    const artifactDataCollection = database.collection("add-artifact");

    // =========== ROUTES START HERE ===========

    // 1. MY ARTIFACTS ROUTES
    app.get("/my-artifacts/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        if (!userId) {
          return res.status(400).json({ error: "User ID is required" });
        }

        const userArtifacts = await artifactDataCollection
          .find({ "addedBy.uid": userId })
          .toArray();

        res.status(200).json(userArtifacts);
      } catch (error) {
        console.error("Error in GET /my-artifacts/:userId:", error);
        res.status(500).json({ error: "Failed to fetch user artifacts" });
      }
    });

    // 2. LIKED ARTIFACTS ROUTES
    app.get("/liked-artifacts/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        if (!userId) {
          return res.status(400).json({ error: "User ID is required" });
        }

        const likedArtifacts = await artifactDataCollection
          .find({ likedBy: userId })
          .toArray();

        res.status(200).json(likedArtifacts);
      } catch (error) {
        console.error("Error in GET /liked-artifacts/:userId:", error);
        res.status(500).json({ error: "Failed to fetch liked artifacts" });
      }
    });

    // 3. GENERAL ARTIFACT ROUTES
    // Get all artifacts
    app.get("/artifacts", async (req, res) => {
      try {
        const artifacts = await artifactDataCollection.find({}).toArray();
        res.status(200).json(artifacts);
      } catch (error) {
        console.error("Error in GET /artifacts:", error);
        res.status(500).json({ error: "Failed to fetch artifacts" });
      }
    });

    app.get("/artifacts/search", async (req, res) => {
      try {
        const { name } = req.query;

        if (!name) {
          // If no search term, return all artifacts
          const allArtifacts = await artifactDataCollection.find({}).toArray();
          return res.status(200).json(allArtifacts);
        }

        // Case-insensitive search using regex
        const artifacts = await artifactDataCollection
          .find({
            name: { $regex: name, $options: "i" },
          })
          .toArray();

        res.status(200).json(artifacts);
      } catch (error) {
        console.error("Error in search artifacts:", error);
        res.status(500).json({ error: "Failed to search artifacts" });
      }
    });
    app.get("/artifacts/top-liked", async (req, res) => {
      try {
        const topArtifacts = await artifactDataCollection
          .find({})
          .sort({ likes: -1 })
          .limit(6)
          .toArray();

        if (!topArtifacts) {
          return res.status(404).json({ error: "No artifacts found" });
        }

        console.log("Found top artifacts:", topArtifacts.length);
        res.status(200).json(topArtifacts);
      } catch (error) {
        console.error("Error fetching top artifacts:", error);
        res.status(500).json({ error: "Failed to fetch top artifacts" });
      }
    });

    // Get single artifact
    app.get("/artifacts/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid artifact ID" });
        }

        const artifact = await artifactDataCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!artifact) {
          return res.status(404).json({ error: "Artifact not found" });
        }

        res.status(200).json(artifact);
      } catch (error) {
        console.error("Error in GET /artifacts/:id:", error);
        res.status(500).json({ error: "Failed to fetch artifact" });
      }
    });

    // Add new artifact
    app.post("/artifacts", async (req, res) => {
      try {
        const artifactData = req.body;
        const requiredFields = [
          "name",
          "image",
          "type",
          "historicalContext",
          "createdAt",
          "discoveredAt",
          "discoveredBy",
          "presentLocation",
          "addedBy",
        ];

        const missingFields = requiredFields.filter(
          (field) => !artifactData[field]
        );

        if (missingFields.length > 0) {
          return res.status(400).json({
            error: `Missing required fields: ${missingFields.join(", ")}`,
          });
        }

        const newArtifact = {
          ...artifactData,
          likes: 0,
          likedBy: [],
          dateAdded: new Date(),
        };

        const result = await artifactDataCollection.insertOne(newArtifact);
        res.status(201).json({
          message: "Artifact added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error in POST /artifacts:", error);
        res.status(500).json({ error: "Failed to add artifact" });
      }
    });

    // Search artifact

    // Update artifact
    app.put("/artifacts/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;
        const { userId } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid artifact ID" });
        }

        // Check ownership
        const artifact = await artifactDataCollection.findOne({
          _id: new ObjectId(id),
          "addedBy.uid": userId,
        });

        if (!artifact) {
          return res
            .status(404)
            .json({ error: "Artifact not found or unauthorized" });
        }

        // Protect sensitive fields
        delete updateData.likes;
        delete updateData.likedBy;
        delete updateData.addedBy;
        delete updateData.userId;

        const result = await artifactDataCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: updateData },
          { returnDocument: "after" }
        );

        if (!result) {
          return res.status(404).json({ error: "Failed to update artifact" });
        }

        res.status(200).json(result);
      } catch (error) {
        console.error("Error in PUT /artifacts/:id:", error);
        res.status(500).json({ error: "Failed to update artifact" });
      }
    });

    // Delete artifact
    app.delete("/artifacts/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { userId } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid artifact ID" });
        }

        // Check ownership
        const artifact = await artifactDataCollection.findOne({
          _id: new ObjectId(id),
          "addedBy.uid": userId,
        });

        if (!artifact) {
          return res
            .status(404)
            .json({ error: "Artifact not found or unauthorized" });
        }

        const result = await artifactDataCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Failed to delete artifact" });
        }

        res.status(200).json({ message: "Artifact deleted successfully" });
      } catch (error) {
        console.error("Error in DELETE /artifacts/:id:", error);
        res.status(500).json({ error: "Failed to delete artifact" });
      }
    });

    // 4. LIKE FUNCTIONALITY
    app.put("/artifacts/:id/like", async (req, res) => {
      try {
        const id = req.params.id;
        const { userId } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid artifact ID" });
        }

        if (!userId) {
          return res.status(400).json({ error: "User ID is required" });
        }

        // Check if already liked
        const alreadyLiked = await artifactDataCollection.findOne({
          _id: new ObjectId(id),
          likedBy: userId,
        });

        if (alreadyLiked) {
          return res
            .status(400)
            .json({ error: "You have already liked this artifact" });
        }

        const result = await artifactDataCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          {
            $inc: { likes: 1 },
            $push: { likedBy: userId },
          },
          { returnDocument: "after" }
        );

        if (!result) {
          return res.status(404).json({ error: "Artifact not found" });
        }

        res.status(200).json(result);
      } catch (error) {
        console.error("Error in PUT /artifacts/:id/like:", error);
        res.status(500).json({ error: "Failed to like artifact" });
      }
    });

    // =========== ERROR HANDLING MIDDLEWARE ===========
    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: "Route not found" });
    });

    // Global error handler
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({ error: "Internal server error" });
    });

    // Start server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

run().catch(console.dir);
